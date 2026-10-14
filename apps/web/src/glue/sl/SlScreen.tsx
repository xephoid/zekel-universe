// The Sweetlands Imperium table in its candy theme: a game-drawn screen
// (docs/games/sweetlands-candy-theme-build.md). The plan's zones stay the
// engine debug client's shape; this screen draws the same view its own way.
// Every move it sends is one the engine listed.

import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { SelectEvent } from '@universe/primitives';
import type { GameScreenProps } from '../types';
import { ZoneRenderer } from '../ZoneRenderer';
import { Board } from './Board';
import { readTable, tileOf, UNITS, type SlTable } from './read';
import { sweetlandsGlue } from '../sweetlands-imperium';
import './sl.css';

function piecesOn(table: SlTable): Record<string, ReactNode[]> {
  const out: Record<string, ReactNode[]> = {};
  for (const p of table.players) {
    for (const u of UNITS) {
      const tile = tileOf(p.units[u]);
      if (!tile) continue;
      (out[tile] ??= []).push(
        <span key={`${p.pid}:${u}`} className="sl-token" data-flip-id={`sl:unit:${p.pid}:${u}`} style={{ background: p.faction ? `var(--zekel-c-${p.faction})` : '#2c2c2c' }} title={`${p.name}'s ${u}`}>
          {u.charAt(0).toUpperCase()}
        </span>,
      );
    }
  }
  return out;
}

export function SlScreen(props: GameScreenProps) {
  const { input, yourTurn, busy, interactive, onMove, onDraw, menu, benchSlot } = props;
  const table = useMemo(() => readTable(input), [input]);
  const plan = useMemo(() => sweetlandsGlue.plan(input), [input]);
  const lit = useMemo(() => (interactive && yourTurn ? sweetlandsGlue.litParts(input) : []), [input, interactive, yourTurn]);
  if (!table) return null;

  const pressable = interactive && yourTurn && !busy;
  const onSelect = (sel: SelectEvent) => {
    if (!pressable) return;
    const moves = sweetlandsGlue.movesForSelect!(sel, input);
    if (moves.length === 1) onMove(moves[0]!);
  };
  const piles = plan?.board.filter((z) => z.kind === 'card-zone') ?? [];
  const bench = (
    <div className="sl-bench">
      {piles.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
      {plan?.bench.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
    </div>
  );

  return (
    <div className="sl-screen">
      <Board table={table} pieces={piecesOn(table)} lit={lit} onTile={(id) => onSelect({ component: 'map', id, label: id })} />
      {/* Dice and Intel draws are resolved by the engine only when the person presses this. */}
      {onDraw && interactive && (
        <button type="button" className="btn big sl-draw" onClick={onDraw} disabled={busy}>
          {/draw|deal/i.test(sweetlandsGlue.resolveReportMove(input.legalMoves)?.description ?? '') ? 'Draw' : 'Roll'}
        </button>
      )}
      {menu}
      {benchSlot ? createPortal(bench, benchSlot) : bench}
    </div>
  );
}
