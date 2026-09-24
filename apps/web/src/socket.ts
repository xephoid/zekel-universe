// The table socket. One connection per browser tab; a table subscribes
// with its last-seen sequence number and the server replays what it missed,
// so a reconnect resumes the playback queue with no gap.

import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@universe/shared';
import type { JoinTableAck, MoveAck, QueryAck, TableEventWire, UndoAck } from '@universe/shared';

export interface TableSocketHandlers {
  onEvent: (e: TableEventWire) => void;
  /** called on every (re)connect, before re-joining; returns the last seq shown */
  lastSeenSeq: () => number;
  onJoined?: (ack: JoinTableAck) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface TableConnection {
  move(seat: number, move: Record<string, unknown>): Promise<MoveAck>;
  /** a read-only question about a decision this seat is composing */
  query(seat: number, name: string, args: Record<string, unknown>): Promise<QueryAck>;
  undo(): Promise<UndoAck>;
  close(): void;
}

let shared: Socket | null = null;

function socket(): Socket {
  if (!shared) shared = io({ withCredentials: true, autoConnect: true });
  return shared;
}

/** Test hook: use a fake socket instead of a real connection. */
export function useFakeSocket(fake: Socket | null): void {
  shared = fake;
}

export function connectTable(tableId: string, h: TableSocketHandlers): TableConnection {
  const s = socket();
  const onEvent = (e: TableEventWire) => h.onEvent(e);
  const join = () => {
    s.emit(SOCKET_EVENTS.joinTable, { tableId, lastSeenSeq: h.lastSeenSeq() }, (ack: JoinTableAck) => h.onJoined?.(ack));
  };
  const onConnect = () => { h.onConnectionChange?.(true); join(); };
  const onDisconnect = () => h.onConnectionChange?.(false);
  s.on(SOCKET_EVENTS.tableEvent, onEvent);
  s.on('connect', onConnect);
  s.on('disconnect', onDisconnect);
  if (s.connected) onConnect();
  return {
    move: (seat, move) => new Promise<MoveAck>((resolve) => {
      s.timeout(20_000).emit(SOCKET_EVENTS.move, { tableId, seat, move }, (err: Error | null, ack?: MoveAck) => {
        if (err || !ack) resolve({ error: 'engine_unavailable', reason: 'The table did not answer. Check your connection.' });
        else resolve(ack);
      });
    }),
    query: (seat, name, args) => new Promise<QueryAck>((resolve) => {
      s.timeout(10_000).emit(SOCKET_EVENTS.query, { tableId, seat, name, args }, (err: Error | null, ack?: QueryAck) => {
        if (err || !ack) resolve({ error: 'engine_unavailable', reason: 'The table did not answer.' });
        else resolve(ack);
      });
    }),
    undo: () => new Promise<UndoAck>((resolve) => {
      s.timeout(20_000).emit(SOCKET_EVENTS.undo, { tableId }, (err: Error | null, ack?: UndoAck) => {
        if (err || !ack) resolve({ error: 'engine_unavailable', message: 'The table did not answer.' });
        else resolve(ack);
      });
    }),
    close: () => {
      s.off(SOCKET_EVENTS.tableEvent, onEvent);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.emit(SOCKET_EVENTS.leaveTable, { tableId });
    },
  };
}
