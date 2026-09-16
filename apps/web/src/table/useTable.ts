// Everything a table needs from the network: the table record and seats,
// the game's reference data, the socket subscription, and the playback
// queue with its saved position. A reload resumes from the last event the
// browser showed; a device that was not watching starts at the latest
// state and plays live from there.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameReferenceResponse, MoveAck, TableEventWire, TableResponse, UndoAck } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { connectTable, type TableConnection } from '../socket';
import { usePlaybackQueue, type PlaybackApi } from '../playback/usePlaybackQueue';

interface Saved { seq: number; event: TableEventWire }

function savedKey(tableId: string): string {
  return `universe:table:${tableId}`;
}

function loadSaved(tableId: string): Saved | null {
  try {
    const raw = localStorage.getItem(savedKey(tableId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    return parsed && typeof parsed.seq === 'number' && parsed.event ? parsed : null;
  } catch {
    return null;
  }
}

function save(tableId: string, event: TableEventWire): void {
  try {
    localStorage.setItem(savedKey(tableId), JSON.stringify({ seq: event.seq, event } satisfies Saved));
  } catch { /* storage unavailable */ }
}

export interface TableApi {
  table: TableResponse | null;
  reference: GameReferenceResponse | null;
  mySeat: number | null;
  playback: PlaybackApi;
  connected: boolean;
  error: string | null;
  refreshTable: () => Promise<void>;
  move: (move: Record<string, unknown>) => Promise<MoveAck>;
  undo: () => Promise<UndoAck>;
}

export function useTable(tableId: string, enabled: boolean): TableApi {
  const playback = usePlaybackQueue();
  const [table, setTable] = useState<TableResponse | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [mySeat, setMySeat] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connRef = useRef<TableConnection | null>(null);

  const refreshTable = useCallback(async () => {
    try {
      const t = await api.table(tableId);
      setTable(t);
      setMySeat(t.mySeats[0] ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : (e as Error).message);
    }
  }, [tableId]);

  // Table record and reference data.
  useEffect(() => {
    if (!enabled) return;
    void refreshTable();
  }, [enabled, refreshTable]);
  useEffect(() => {
    if (!table) return;
    let stop = false;
    api.reference(table.table.gameId).then((r) => { if (!stop) setReference(r); }).catch(() => {});
    return () => { stop = true; };
  }, [table?.table.gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Starting position, then the live subscription.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let conn: TableConnection | null = null;
    (async () => {
      const saved = loadSaved(tableId);
      if (saved) {
        playback.seed(saved.event);
      } else {
        try {
          const { events } = await api.tableEvents(tableId, 0);
          const last = events[events.length - 1];
          if (last && !cancelled) playback.seed(last);
        } catch (e) {
          if (!cancelled) setError(e instanceof ApiRequestError ? e.message : (e as Error).message);
          return;
        }
      }
      if (cancelled) return;
      conn = connectTable(tableId, {
        onEvent: (e) => playback.push(e),
        lastSeenSeq: () => playback.lastSeq(),
        onJoined: (ack) => {
          if ('ok' in ack && ack.ok) setMySeat(ack.seats[0] ?? null);
          else if ('error' in ack) setError(ack.message ?? ack.error);
        },
        onConnectionChange: setConnected,
      });
      connRef.current = conn;
    })();
    return () => {
      cancelled = true;
      conn?.close();
      connRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, enabled]);

  // Remember the last event shown so a reload resumes from it.
  const current = playback.state.current;
  useEffect(() => {
    if (current) save(tableId, current);
  }, [tableId, current]);

  // When the game ends, refresh the table record for the result.
  useEffect(() => {
    if (current?.gameOver) void refreshTable();
  }, [current?.gameOver, refreshTable]);

  return {
    table,
    reference,
    mySeat,
    playback,
    connected,
    error,
    refreshTable,
    move: (move) => connRef.current
      ? connRef.current.move(mySeat ?? 0, move)
      : Promise.resolve({ error: 'engine_unavailable', reason: 'Not connected to the table yet.' }),
    undo: () => connRef.current ? connRef.current.undo() : Promise.resolve({ error: 'engine_unavailable', message: 'Not connected.' }),
  };
}
