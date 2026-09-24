// The table every NGnG screen renders inside: the map with the action stack
// floating over it, the decision in the right-hand column above the seats and
// the culture race, and the seat's own faction board folded into a strip
// along the bottom. These regions are ambient (SCREEN-ROUTING §7): they are
// never routed to, and they change underneath whatever decision is open.

import { useState, type ReactNode } from 'react';
import type { ScreenCtx } from './ctx';
import { HexMap, type MapMarks } from './HexMap';
import { inkOf, inkOfSeat } from './factions';
import { WAITING_ON } from './route';
import { CardBack, FactionChip, Icon, Panel } from './ui';
import { FactionBoard, FactionStrip } from './FactionBoard';

const CARD_ICON: Record<string, string> = { build: 'Build', research: 'Research', move_battle: 'Move / Battle' };
const CARD_NAME: Record<string, string> = { build: 'Build', research: 'Research', move_battle: 'Move / Battle' };

function ActionStack({ ctx }: { ctx: ScreenCtx }) {
  const { v } = ctx;
  if (v.stack.length === 0) return null;
  const top = v.stack[v.stack.length - 1];
  const resolving = v.activeAction && top && top.owner === v.activeAction.owner ? top.position : null;
  return (
    <div className="ngg-float ngg-stack" aria-label="Action stack">
      <div className="ngg-float-title">Action stack</div>
      <ol className="ngg-stack-rows">
        {[...v.stack].reverse().map((a) => {
          const ink = inkOfSeat(v, a.owner);
          const now = a.position === resolving;
          return (
            <li key={a.position} className={`ngg-stack-row${now ? ' now' : ''}`} data-flip-id={`ngg-stack:${a.position}:${a.owner}`}>
              <span className="ngg-dot" style={{ background: ink.fill }} title={ctx.seat(a.owner)} />
              {a.cardKind
                ? <><span className="ngg-stack-mark"><Icon name={CARD_ICON[a.cardKind] ?? 'Build'} size={15} stroke={1.8} /></span><span className="ngg-stack-name">{CARD_NAME[a.cardKind] ?? a.cardKind}</span></>
                : <><CardBack /><span className="ngg-stack-name muted">Face down</span></>}
              {now && <span className="ngg-tag">NOW</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pills({ ctx }: { ctx: ScreenCtx }) {
  const { v } = ctx;
  const first = inkOfSeat(v, v.firstPlayerId);
  return (
    <div className="ngg-pills">
      {v.firstPlayerId && (
        <span className="ngg-pill"><span className="ngg-dot" style={{ background: first.fill }} />First player · {ctx.seat(v.firstPlayerId)}</span>
      )}
      <span className="ngg-pill">{v.tiles.length} tiles</span>
    </div>
  );
}

function SeatsPanel({ ctx }: { ctx: ScreenCtx }) {
  const { v } = ctx;
  return (
    <Panel title="Seats">
      <ul className="ngg-seats">
        {v.players.map((p) => {
          const you = p.id === ctx.me;
          const deciding = v.pending ? v.pending.for === p.id : v.activePlayerId === p.id;
          return (
            <li key={p.id} className={`ngg-seat${you ? ' you' : ''}${deciding ? ' deciding' : ''}`}>
              <span data-flip-id={`ngg-supply:${p.id}`}><FactionChip faction={p.faction} size={24} /></span>
              <span className="ngg-seat-name">
                <span>{ctx.seat(p.id)}</span>
                <span className="ngg-seat-detail">{[you ? 'you' : null, p.species, `${p.bases.length} base${p.bases.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ngg-stat"><b>{p.culture}</b><i>CULT</i></span>
              <span className="ngg-stat"><b>{p.tech.total}{p.tech.target !== null ? `/${p.tech.target}` : ''}</b><i>TECH</i></span>
              <span className="ngg-stat"><b className={p.leaderAlive ? 'ok' : 'dead'}>{p.leaderAlive ? '✓' : '✕'}</b><i>LEAD</i></span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function CultureRace({ ctx }: { ctx: ScreenCtx }) {
  const { v, ref } = ctx;
  const target = ref?.cultureTarget ?? 100;
  const marks = [...(ref?.milestones ?? []), target];
  const lanes = [...v.players].sort((a, b) => b.culture - a.culture);
  const pct = (n: number) => `${Math.min(100, (n / target) * 100)}%`;
  return (
    <Panel title="Culture" kicker={`${target} wins · a hero at each flag`}>
      <div className="ngg-race">
        <div className="ngg-race-axis">
          {marks.map((m) => <span key={m} style={{ left: pct(m) }}><i />{m}</span>)}
        </div>
        {lanes.map((p) => {
          const ink = inkOf(p.faction);
          return (
            <div key={p.id} className="ngg-race-lane" title={`${ctx.seat(p.id)} · ${p.culture}`}>
              <span className="ngg-race-fill" style={{ width: pct(p.culture), background: ink.fill }} />
              <span className="ngg-race-marker" style={{ left: pct(p.culture), background: ink.fill, color: ink.on }}>{p.culture}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** The line a seat reads while another seat owes the decision: who, and what kind. */
export function WaitingLine({ ctx }: { ctx: ScreenCtx }) {
  const { v, route } = ctx;
  if (route.perspective !== 'watch' || !route.owner) return null;
  const doing = v.pending ? WAITING_ON[v.pending.kind] : null;
  return (
    <div className="ngg-waiting" aria-live="polite">
      <FactionChip faction={v.players.find((p) => p.id === route.owner)?.faction ?? null} size={18} />
      <span>Waiting on {ctx.seat(route.owner)}{doing ? ` — ${doing}` : ''}</span>
    </div>
  );
}

export function TableLayout({ ctx, marks, panel, interrupt }: {
  ctx: ScreenCtx;
  marks?: MapMarks;
  /** the decision: what this screen asks, its options, its buttons */
  panel?: ReactNode;
  /** an out-of-turn decision drawn above everything, leaving the rest in place */
  interrupt?: ReactNode;
}) {
  const [boardOpen, setBoardOpen] = useState(false);
  const species = ctx.mine?.species ?? null;
  return (
    <div className={`ngg-root${species ? ` seat-${species}` : ''}`}>
      <div className="ngg-main">
        <div className="ngg-board">
          <HexMap v={ctx.v} marks={marks} seatSpecies={species} overlay={<><ActionStack ctx={ctx} /><Pills ctx={ctx} /></>} />
        </div>
        <div className="ngg-column">
          <WaitingLine ctx={ctx} />
          {panel}
          <SeatsPanel ctx={ctx} />
          <CultureRace ctx={ctx} />
        </div>
      </div>
      {ctx.mine && <FactionStrip ctx={ctx} player={ctx.mine} onOpen={() => setBoardOpen(true)} />}
      {boardOpen && ctx.mine && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setBoardOpen(false)}>
          <div className={`sheet ngg-board-sheet seat-${ctx.mine.species ?? 'wizard'}`} role="dialog" aria-label="Your faction board" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn secondary small close" onClick={() => setBoardOpen(false)} aria-label="Close the faction board">✕</button>
            <FactionBoard ctx={ctx} player={ctx.mine} />
          </div>
        </div>
      )}
      {interrupt && (
        <div className="ngg-interrupt-layer" role="presentation">
          <div className="ngg-interrupt" role="dialog" aria-label="Your decision, out of turn">{interrupt}</div>
        </div>
      )}
    </div>
  );
}
