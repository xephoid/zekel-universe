// The Warble Way Galaxy table as a game-drawn screen (build item 5): one
// part per board, picked from the engine's phase and pending. The captain's
// sheet on the left, the moment in the middle, the journey, ship and crew
// on the right (in the table's side column when it is open). The top bar,
// the caption, the log and the numbered menu stay the table's. Every move
// the screen sends is one the engine listed.

import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GameScreenProps } from '../types';
import { asStr } from '../types';
import { readTable, type WwTable } from './read';
import { Credits, CrewPanel, DamagePlates, GalaxyStrip, JourneyPanel, Lbl, Num, Sheet, ShipPanel, legWords, missionTitles } from './ui';
import { Icon } from './icons';
import { SpacePart, type PartProps } from './parts/SpacePart';
import { EncounterCard, EncounterPart, isEncounterPending } from './parts/EncounterPart';
import { AboardPanel, PirateCard, PiratePart, PirateSteps, isPirateMoment } from './parts/PiratePart';
import { HabitatPart } from './parts/HabitatPart';
import { RuinRoundPart, RuinSetupPart } from './parts/RuinPart';
import { DeparturePeek, LevelUp, ReleaseCrew } from './parts/Overlays';
import './ww-screen.css';

type Mode = 'habitat' | 'space' | 'encounter' | 'pirate' | 'ruin-setup' | 'ruin' | 'over';

export function modeOf(table: WwTable): Mode {
  const p = table.pending;
  if (table.phase === 'game_over') return 'over';
  if (table.phase === 'ruin' || table.ruin) {
    // Between levels the goal panel sits on the round's layout; setup is its own.
    if (p?.kind === 'ruin_setup' || (!ruinHasBoard(table) && p?.kind !== 'ruin_continue')) return 'ruin-setup';
    return 'ruin';
  }
  if (isPirateMoment(table)) return 'pirate';
  if (isEncounterPending(p, table.phase)) return 'encounter';
  if (table.phase === 'at_habitat') return 'habitat';
  return 'space';
}

const ruinHasBoard = (table: WwTable) => !!table.ruin && table.ruin.party.length + table.ruin.attackers.length > 0;

export function WwScreen(props: GameScreenProps) {
  const { input, yourTurn, busy, interactive, onMove, onForm, onDraw, sideSlot, phone } = props;
  const table = useMemo(() => readTable(input.view, input.reference), [input.view, input.reference]);
  const [tab, setTab] = useState<'now' | 'sheet' | 'ship' | 'journey'>('now');
  if (!table) return null;
  const pressable = interactive && yourTurn && !busy;
  const part: PartProps = { table, input, pressable, onMove, onForm, onDraw: interactive ? onDraw : undefined, phone, sideOut: !!sideSlot };
  const mode = modeOf(table);
  const p = table.pending;
  const overlay = p?.kind === 'level_up' ? <LevelUp {...part} /> : p?.kind === 'release_crew' ? <ReleaseCrew {...part} /> : p?.kind === 'res_discard' ? <DeparturePeek {...part} /> : null;
  const right = (node: JSX.Element): JSX.Element => (sideSlot ? createPortal(<div className="ww-right">{node}</div>, sideSlot) : <aside className="ww-right">{node}</aside>);
  const sideOut = !!sideSlot;

  if (phone) {
    const leg = table.journey.find((l) => l.current);
    return (
      <div className="ww-screen ww-phone">
        <div className="ww-phone-strip">
          <div className="ww-row between">
            <Credits me={table.me} />
            {leg && <span className="ww-phone-leg"><span style={{ color: '#FFD700' }}><Icon name="idcard" size={14} /></span>{legWords(leg, missionTitles(input.reference))} <Num>{leg.cardsRemaining}</Num></span>}
            {!leg && table.habitat && <span className="ww-phone-leg">#{table.habitat.number} {table.habitat.name}</span>}
          </div>
          {table.ship && <div className="ww-row" style={{ gap: 10 }}><span className="ww-dim"><Icon name="ship" size={18} /></span><div style={{ flex: 1 }}><DamagePlates ship={table.ship} height={18} /></div><Lbl style={{ fontSize: 11, color: '#f2b544' }}>{table.ship.damage.toUpperCase()}</Lbl></div>}
        </div>
        {tab === 'now' && <PhoneNow mode={mode} part={part} table={table} />}
        {tab === 'sheet' && <Sheet table={table} reference={input.reference} />}
        {tab === 'ship' && <><ShipPanel table={table} /><CrewPanel table={table} /></>}
        {tab === 'journey' && <><JourneyPanel table={table} reference={input.reference} /><div className="ww-panel"><GalaxyStrip table={table} reference={input.reference} /></div></>}
        {tab === 'now' && yourTurn && <div className="ww-menu"><MoveList input={input} pressable={pressable} onMove={onMove} /></div>}
        <nav className="ww-phone-tabs" aria-label="Sections">
          {([['now', 'meteor', 'Now'], ['sheet', 'skills', 'Sheet'], ['ship', 'ship', 'Ship'], ['journey', 'rocket', 'Journey']] as const).map(([k, icon, word]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)} aria-pressed={tab === k}><Icon name={icon} size={20} />{word}</button>
          ))}
        </nav>
        {overlay}
      </div>
    );
  }

  let left: ReactNode = <aside className="ww-left"><Sheet table={table} reference={input.reference} /></aside>;
  let main: ReactNode = null;
  let rightNode: ReactNode = null;
  let gridClass = 'ww-grid';
  let steps: ReactNode = null;
  if (mode === 'habitat') {
    main = <HabitatPart {...part} right={right} />;
  } else if (mode === 'ruin-setup' || mode === 'ruin') {
    left = null; gridClass = 'ww-grid no-left';
    main = mode === 'ruin' ? <RuinRoundPart {...part} right={right} /> : <RuinSetupPart {...part} right={right} />;
  } else {
    if (mode === 'encounter') { left = <EncounterCard table={table} />; gridClass = 'ww-grid card-left'; }
    if (mode === 'pirate') { left = <aside className="ww-left"><PirateCard table={table} /></aside>; gridClass = 'ww-grid card-left'; steps = <PirateSteps table={table} />; }
    main = mode === 'encounter' ? <EncounterPart {...part} /> : mode === 'pirate' ? <PiratePart {...part} /> : mode === 'over' ? <GameOver table={table} /> : <SpacePart {...part} />;
    rightNode = right(
      mode === 'pirate'
        ? <AboardPanel table={table} />
        : <><JourneyPanel table={table} reference={input.reference} /><ShipPanel table={table} /><CrewPanel table={table} /></>,
    );
  }
  return (
    <div className="ww-screen" data-mode={mode}>
      <div className="ww-strip">
        {steps ?? <GalaxyStrip table={table} reference={input.reference} />}
        <Credits me={table.me} />
      </div>
      <div className={`${gridClass}${!sideOut && mode !== 'ruin' && mode !== 'ruin-setup' ? ' with-right' : ''}`}>
        {left}
        {main}
        {rightNode}
      </div>
      {yourTurn && <div className="ww-menu"><MoveList input={input} pressable={pressable} onMove={onMove} /></div>}
      {overlay}
    </div>
  );
}

/** The numbered list of every listed move, always open, under the screen:
 *  the table's own menu closes beside a screen, and the words are the
 *  engine's. The browser spec and a reader who prefers words use it. */
function MoveList({ input, pressable, onMove }: { input: PartProps['input']; pressable: boolean; onMove: PartProps['onMove'] }) {
  if (input.legalMoves.length === 0) return null;
  return (
    <details className="move-menu" open>
      <summary>Moves ({input.legalMoves.length}) · in the engine's words</summary>
      <ol>
        {input.legalMoves.map((m, i) => (
          <li key={m.move_id ?? i}><button type="button" disabled={!pressable} onClick={() => onMove(m)}>{m.description ?? m.move_id ?? 'move'}</button></li>
        ))}
      </ol>
    </details>
  );
}

function PhoneNow({ mode, part, table }: { mode: Mode; part: PartProps; table: WwTable }) {
  const inline = (node: JSX.Element) => <div className="ww-right">{node}</div>;
  if (mode === 'habitat') return <HabitatPart {...part} right={inline} />;
  if (mode === 'ruin') return <RuinRoundPart {...part} right={inline} />;
  if (mode === 'ruin-setup') return <RuinSetupPart {...part} right={inline} />;
  if (mode === 'encounter') return <><EncounterCard table={table} /><EncounterPart {...part} /></>;
  if (mode === 'pirate') return <><PirateSteps table={table} /><PirateCard table={table} /><PiratePart {...part} /></>;
  if (mode === 'over') return <GameOver table={table} />;
  return <SpacePart {...part} />;
}

function GameOver({ table }: { table: WwTable }) {
  const r = table.result;
  const summary = r && typeof r === 'object' && 'summary' in r ? asStr((r as Record<string, unknown>)['summary']) : '';
  return (
    <div className="ww-main"><div className="ww-main-card"><Lbl style={{ color: '#FFD700' }}>THE SEASON ENDS</Lbl><h1 className="ww-h1">Game over</h1><span className="ww-lede">{summary}</span></div></div>
  );
}
