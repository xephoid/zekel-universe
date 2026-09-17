// Watching a table: anyone with the link sees the engine's public view
// (the engine leaves hidden information out), whose turn it is, and the
// log. Nothing here can act; there is no socket and no seat. The board is
// drawn by the same glue as the players' tables, with no seat of its own,
// and it redraws when the table's event count moves on.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameReferenceResponse, WatchResponse } from '@universe/shared';
import { FlipRoot, paletteVars, useSystemReducedMotion } from '@universe/primitives';
import { api, ApiRequestError } from '../api';
import { glueFor, type GlueInput } from '../glue';
import { JsonInspector, ZoneRenderer } from '../glue/ZoneRenderer';
import { Nav } from './Nav';

const POLL_MS = 3000;

export function WatchPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<WatchResponse | null>(null);
  const [previous, setPrevious] = useState<unknown>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const memory = useRef(new Map<string, unknown>());
  const reduced = useSystemReducedMotion();

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const w = await api.watch(id);
        if (stop) return;
        setData((prev) => {
          if (prev && prev.seq !== w.seq) setPrevious(prev.view);
          return w;
        });
        setErr(null);
      } catch (e) {
        if (!stop) setErr(e instanceof ApiRequestError ? e.message : (e as Error).message);
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [id]);

  useEffect(() => {
    if (!data?.table.gameId) return;
    let stop = false;
    api.reference(data.table.gameId).then((r) => { if (!stop) setReference(r); }).catch(() => {});
    return () => { stop = true; };
  }, [data?.table.gameId]);

  const glue = data ? glueFor(data.table.gameId) : null;
  const input: GlueInput | null = useMemo(() => data ? ({
    view: data.view, previous, legalMoves: [], playerId: null, reference,
    seq: data.seq, engineMove: null, actorPlayerId: null, memory: memory.current,
  }) : null, [data, previous, reference]);
  const plan = useMemo(() => (glue && input && data?.view ? glue.plan(input) : null), [glue, input, data?.view]);

  if (err && !data) {
    return (<div><Nav /><div className="page"><p className="error">{err}</p><Link to="/">Back home</Link></div></div>);
  }
  if (!data) return (<div><Nav /><div className="page"><p className="muted">Loading…</p></div></div>);

  const next = data.table.nextActorPosition === null ? null : data.seats.find((s) => s.position === data.table.nextActorPosition);
  const status = data.table.status === 'finished' || data.table.result
    ? `Game over${data.table.result?.summary ? `: ${data.table.result.summary}` : ''}`
    : data.table.status === 'lobby' ? 'Waiting in the lobby'
    : next ? `Waiting on ${next.displayName ?? `seat ${next.position + 1}`}` : 'The AI is thinking…';
  const watchLink = `${window.location.origin}/table/${id}/watch`;

  return (
    <FlipRoot viewKey={data.seq} className="table-shell watch-shell" style={paletteVars(plan?.palette)} reducedMotion={reduced}>
      <div className="table-topbar">
        <span className="title">{plan?.title ?? data.table.gameName}</span>
        {plan?.status && <span className="round-note" aria-hidden="true">{plan.status}</span>}
        <span className="spacer center">
          <span className="turn-pill" aria-live="polite"><span className="dot" />{status}</span>
        </span>
        <span className="chip-btn watching" aria-label="You are watching, not playing">Watching</span>
        <button className="chip-btn" onClick={() => { void navigator.clipboard?.writeText(watchLink); setCopied(true); }}>{copied ? 'Link copied' : 'Share'}</button>
        <Link className="chip-btn" to={`/games/${data.table.gameId}`}>Play this game</Link>
        <Link className="chip-btn leave" to="/">Leave</Link>
      </div>
      <div className="table-main">
        <div className="table-board">
          {data.table.status === 'lobby' ? (
            <p className="muted">The table has not started. Players in the lobby: {data.seats.filter((s) => s.kind === 'human' && s.displayName).map((s) => s.displayName).join(', ') || 'none yet'}.</p>
          ) : plan ? (
            <div className="zones">{plan.board.map((z) => <ZoneRenderer key={z.id} zone={z} lit={[]} onSelect={() => {}} />)}</div>
          ) : data.view ? (
            <JsonInspector value={data.view} />
          ) : (
            <p className="muted">Nothing to show yet.</p>
          )}
          {plan && plan.bench.length > 0 && (
            <div className="zones">{plan.bench.map((z) => <ZoneRenderer key={z.id} zone={z} lit={[]} onSelect={() => {}} />)}</div>
          )}
        </div>
        <div className="table-side">
          <section className="zk-tableau" aria-label="Seats">
            <div className="zk-tableau-title"><span>Seats</span></div>
            {data.seats.map((s) => (
              <div key={s.position} className="zk-stat">
                <span>Seat {s.position + 1}</span>
                <b>{s.displayName ?? 'open'}{s.position === data.table.nextActorPosition ? ' · to move' : ''}</b>
              </div>
            ))}
          </section>
          {plan?.side.map((z) => <ZoneRenderer key={z.id} zone={z} lit={[]} onSelect={() => {}} />)}
          {plan?.points && <ZoneRenderer zone={plan.points} lit={[]} onSelect={() => {}} />}
          <section className="log" aria-label="Log">
            <div className="zk-zone-label">Log</div>
            <ul>{data.log.map((e) => <li key={e.seq}>{e.summary}</li>)}</ul>
          </section>
          {err && <p className="error">{err}</p>}
        </div>
      </div>
    </FlipRoot>
  );
}
