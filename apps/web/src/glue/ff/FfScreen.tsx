// The Fractured Fist table, drawn by the game (docs/design/fractured-fist-arcade,
// Table-Technique.dc.html and Table-Channel.dc.html): both fighters' plates
// at the top facing each other like a fighting game's health bars, their
// played row, the strike gutter, your played row, the action bar, and your
// hand, deck and discard under the play column. The supply goes to the top
// of the side column when the table has one.
//
// Nothing here decides anything. Every number is ff/read.ts's reading of the
// view, a tap sends a move the engine listed, and the buttons are the moves
// that move the turn, each present only while the engine lists it.

import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CardZone, Track, type SelectEvent, type TrackData } from '@universe/primitives';
import type { GameScreenProps, PromptAction, Zone } from '../types';
import { fightOf, litPartsFor, moveForTap, STEP_NAMES, type Fight, type Fighter } from './read';

/** A card zone drawn without its own label: the screen draws the heading. */
function Cards({ zone, lit, onSelect, className }: { zone: Zone; lit: string[]; onSelect: (e: SelectEvent) => void; className?: string }) {
  if (zone.kind !== 'card-zone') return null;
  return <CardZone id={zone.id} data={{ ...zone.data, label: undefined }} lit={lit} onSelect={onSelect} arriveFrom={zone.arriveFrom} className={className} />;
}

/** A row of blocks, one per point: a track whose filled spaces are what is left. */
function blocks(count: number, of: number): TrackData {
  return { spaces: Array.from({ length: Math.max(0, of) }, (_, i) => ({ index: i + 1, filled: i < count })) };
}

function Plate({ f, side, big, small, showCounts, watching, lit, onSelect }: {
  f: Fighter; side: 'left' | 'right'; big: string; small?: string; showCounts: boolean; watching: boolean;
  lit: string[]; onSelect: (e: SelectEvent) => void;
}) {
  const cap = f.misstepCap;
  const turn = f.active ? (f.self ? 'Your turn' : watching ? 'On turn' : 'Their turn') : null;
  return (
    <section
      className={`ff-plate ${side}${f.active ? ' active' : ''}`}
      aria-label={`${big}: stamina ${f.stamina} of ${f.maxStamina}; missteps ${f.missteps}${cap !== null ? ` of ${cap}` : ''}`}
    >
      <span className="ff-plate-badge" aria-hidden="true"><span>{big.slice(0, 1)}</span></span>
      {showCounts && (
        // Their discard is public: its top card, where their cards land.
        <div className="ff-plate-discard" title={`Discard: ${f.discardSize}`}>
          <Cards zone={f.zones.discard} lit={lit} onSelect={onSelect} />
        </div>
      )}
      <div className="ff-plate-body">
        <div className="ff-plate-head">
          <span className="ff-plate-name">{big}</span>
          {small && <span className="ff-plate-sub">{small}</span>}
          {turn && <span className="ff-tag"><span>{turn}</span></span>}
          {showCounts && (
            <span className="ff-plate-counts">
              <span data-flip-id={f.zones.hand.id}>Hand {f.handSize}</span>
              <span data-flip-id={f.zones.deck.id}>Deck {f.deckSize}</span>
              <span>Discard {f.discardSize}</span>
            </span>
          )}
        </div>
        <Track id={`ff:stamina:${f.pid}`} data={blocks(f.stamina, f.maxStamina)} className="ff-blocks" />
        <div className="ff-missteps">
          <span className="ff-kicker">Missteps</span>
          {cap !== null && <Track id={`ff:missteps:${f.pid}`} data={blocks(f.missteps, cap)} className="ff-ticks" />}
          <b>{f.missteps}{cap !== null ? ` / ${cap}` : ''}</b>
        </div>
      </div>
      <div className="ff-plate-stam" aria-hidden="true"><b>{f.stamina}</b><span>/{f.maxStamina}</span></div>
    </section>
  );
}

function Hit({ from, to, name, dir }: { from: Fighter; to: Fighter; name: (f: Fighter) => string; dir: 'down' | 'up' }) {
  const who = name(from);
  const whom = name(to);
  const verb = who === 'You' ? 'hit' : 'hits';
  return (
    <div className="ff-hit" aria-label={`${who} ${verb} ${whom === 'You' ? 'you' : whom}: ${from.damageQueued} damage against ${to.defenseQueued} defense`}>
      <span className={`ff-hit-arrow ${dir}`} aria-hidden="true" />
      <span className="ff-hit-who">{who} {verb} {whom === 'You' ? 'you' : whom}</span>
      <span className="ff-chip damage"><span><b>{from.damageQueued}</b> damage</span></span>
      <span className="ff-vs-small" aria-hidden="true">vs</span>
      <span className="ff-chip defense"><span><b>{to.defenseQueued}</b> defense</span></span>
    </div>
  );
}

function Row({ title, zone, count, lit, onSelect }: { title: string; zone: Zone; count: number; lit: string[]; onSelect: (e: SelectEvent) => void }) {
  return (
    <section className="ff-row" aria-label={`${title}: ${count}`}>
      <h3 className="ff-row-head">{title}<span className="ff-count"><span>{count}</span></span></h3>
      <Cards zone={zone} lit={lit} onSelect={onSelect} className="ff-row-cards" />
    </section>
  );
}

function ActionBar({ fight, onAction, onDraw, disabled }: {
  fight: Fight; onAction: (a: PromptAction) => void; onDraw?: () => void; disabled: boolean;
}) {
  const { prompt, steps, counters } = fight;
  // The step tags already say which step it is; the title is shown only
  // when it says something else ("Remove 2 more cards", "No actions left").
  const plain = Object.values(STEP_NAMES).some((s) => prompt.title === `${s} step`);
  return (
    <div className={`ff-actionbar${prompt.actions.length ? ' live' : ''}${prompt.urgent ? ' urgent' : ''}`} role="region" aria-label="Your turn">
      <div className="ff-steps">
        <span className="ff-kicker">Step</span>
        <div className="ff-steps-tags" aria-label="Steps">
          {steps.map((s) => (
            <span key={s.id} className={`ff-step${s.current ? ' current' : ''}`} aria-current={s.current ? 'step' : undefined}><span>{s.label}</span></span>
          ))}
        </div>
      </div>
      {counters.length > 0 && (
        <div className="ff-counters">
          {counters.map((c) => (
            <div key={c.label} className="ff-counter"><b>{c.value}</b><span>{c.label}</span></div>
          ))}
        </div>
      )}
      <div className="ff-words">
        {!plain && <b>{prompt.title}</b>}
        {prompt.sub && <span>{prompt.sub}</span>}
      </div>
      <div className="ff-buttons">
        {onDraw && <button className="btn" disabled={disabled} onClick={onDraw}>Draw</button>}
        {prompt.actions.map((a) => (
          <button key={a.id} className={`btn${a.primary ? '' : ' secondary'}`} disabled={disabled} title={a.title} onClick={() => onAction(a)}>
            {a.label}{a.note && <span className="note">{a.note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bench({ me, lit, onSelect, refining, menu }: { me: Fighter; lit: string[]; onSelect: (e: SelectEvent) => void; refining: boolean; menu?: ReactNode }) {
  const hand = me.zones.hand;
  const anyLit = hand.kind === 'card-zone' && (hand.data.cards ?? []).some((c) => c.id && lit.includes(c.id));
  const hint = refining ? 'Pick one to remove' : anyLit ? 'Lit cards can be played now' : null;
  return (
    <div className="ff-bench">
      {/* The numbered menu: every listed move, for the keyboard. */}
      <div className="ff-menu">{menu}</div>
      <section className={`ff-hand${anyLit ? ' has-lit' : ''}`} aria-label={`Your hand: ${me.handSize}`}>
        <div className="ff-bench-label">
          <span>Your hand · {me.handSize}</span>
          {hint && <span className="ff-hint">{hint}</span>}
        </div>
        <Cards zone={hand} lit={lit} onSelect={onSelect} />
      </section>
      <div className="ff-piles">
        <figure className="ff-pile">
          <Cards zone={me.zones.deck} lit={lit} onSelect={onSelect} />
          <figcaption>Deck · {me.deckSize}</figcaption>
        </figure>
        <figure className="ff-pile">
          <Cards zone={me.zones.discard} lit={lit} onSelect={onSelect} />
          <figcaption>Discard · {me.discardSize}</figcaption>
        </figure>
      </div>
    </div>
  );
}

export function FfScreen(props: GameScreenProps) {
  const { input, yourTurn, busy, interactive, onMove, onBatch, onDraw, nameFor, menu, sideSlot } = props;
  const fight = useMemo(() => fightOf(input), [input]);
  const lit = useMemo(() => (interactive && yourTurn ? litPartsFor(input) : []), [input, interactive, yourTurn]);
  if (!fight) return null;

  const pressable = interactive && yourTurn && !busy;
  const onSelect = (sel: SelectEvent) => {
    if (!pressable) return;
    const move = moveForTap(sel, input);
    if (move) onMove(move);
  };
  const onAction = (a: PromptAction) => {
    if (!pressable) return;
    if ('move' in a) onMove(a.move);
    else if ('batch' in a) onBatch?.(a.batch);
    else if (a.moves.length === 1) onMove(a.moves[0]!);
  };
  const watching = input.playerId === null;
  // The big name is the side ("You", "Opponent"); a seat's display name sits
  // beside it. A watcher sees both seats by name.
  const big = (f: Fighter) => (watching ? nameFor(f.pid) : f.who);
  const small = (f: Fighter) => (watching ? undefined : nameFor(f.pid));
  const { left, right, me } = fight;
  const refining = !!me && fight.counters.some((c) => c.label === 'Refines');

  // In the Channel step the stacks you can buy are lit and the rest dim;
  // the outline is the cue, and the opponent's counts are never pressable.
  const buying = !!me && me.active && fight.phase === 'channel' && interactive && yourTurn;
  const supply = (
    <section className={`ff-supply${buying ? ' buying' : ''}`} aria-label="Supply">
      <h3 className="ff-supply-title">Supply</h3>
      {fight.supply.kind === 'card-zone' && (
        <CardZone id={fight.supply.id} data={fight.supply.data} lit={lit} onSelect={onSelect} className="ff-supply-list" />
      )}
    </section>
  );

  return (
    <div className="ff-screen">
      <div className="ff-versus">
        <Plate f={left} side="left" big={big(left)} small={small(left)} showCounts={!left.self} watching={watching} lit={lit} onSelect={onSelect} />
        <span className="ff-vs" aria-hidden="true"><span>VS</span></span>
        <Plate f={right} side="right" big={big(right)} small={small(right)} showCounts={!right.self} watching={watching} lit={lit} onSelect={onSelect} />
      </div>
      <Row title={big(right) === 'Opponent' ? 'Their played cards' : `${big(right)}'s played cards`} zone={right.zones.played} count={cardCount(right.zones.played)} lit={lit} onSelect={onSelect} />
      <section className="ff-gutter" aria-label="The strike, at the end of the round">
        <Hit from={right} to={left} name={big} dir="down" />
        <div className="ff-strike-note"><span className="ff-burst" aria-hidden="true" /><b>Strike</b><span>Both land at round end</span></div>
        <Hit from={left} to={right} name={big} dir="up" />
      </section>
      <Row title={left.self ? 'Your played cards' : `${big(left)}'s played cards`} zone={left.zones.played} count={cardCount(left.zones.played)} lit={lit} onSelect={onSelect} />
      {!sideSlot && supply}
      {sideSlot && createPortal(supply, sideSlot)}
      {me && <ActionBar fight={fight} onAction={onAction} onDraw={onDraw} disabled={!pressable} />}
      {me && <Bench me={me} lit={lit} onSelect={onSelect} refining={refining} menu={menu} />}
    </div>
  );
}

function cardCount(zone: Zone): number {
  return zone.kind === 'card-zone' ? zone.data.cards?.length ?? zone.data.countOnly ?? 0 : 0;
}
