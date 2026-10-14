// The Sweetlands Imperium table in its candy theme: a game-drawn screen
// (docs/games/sweetlands-candy-theme-build.md). The plan's zones stay the
// engine debug client's shape; this screen draws the same view its own way.
// Every move it sends is one the engine listed.

import { useMemo, useState, type ReactNode } from 'react';
import type { SelectEvent } from '@universe/primitives';
import type { GameScreenProps } from '../types';
import { Board } from './Board';
import { Piece, pieceTitle } from './Piece';
import { Players } from './Players';
import { Hand } from './Hand';
import { readTable, tileOf, UNITS, type SlTable } from './read';
import { sweetlandsGlue } from '../sweetlands-imperium';
import './sl.css';

/** Every piece on the board, by the tile it stands on. Pieces go two to a row. */
function piecesOn(table: SlTable, focus: string | null, onFocus: (id: string) => void): Record<string, ReactNode[]> {
  const out: Record<string, ReactNode[]> = {};
  for (const p of table.players) {
    for (const u of UNITS) {
      const tile = tileOf(p.units[u]);
      if (!tile) continue;
      const id = `${p.pid}:${u}`;
      (out[tile] ??= []).push(
        <Piece
          key={id} player={p} unit={u} size={25} flipId={`sl:unit:${id}`}
          title={pieceTitle(table, p, u)} focused={focus === id} onClick={() => onFocus(id)}
        />,
      );
    }
  }
  return out;
}

export function SlScreen(props: GameScreenProps) {
  const { input, yourTurn, busy, interactive, onMove, onForm, onDraw, menu, nameFor } = props;
  const table = useMemo(() => readTable(input), [input]);
  const lit = useMemo(() => (interactive && yourTurn ? sweetlandsGlue.litParts(input) : []), [input, interactive, yourTurn]);
  /** the piece being looked at ("p2:knight"): ringed on the board and in the players panel */
  const [focus, setFocus] = useState<string | null>(null);
  /** the card picked from the hand, by its engine card id */
  const [picked, setPicked] = useState<string | null>(null);
  if (!table) return null;
  const onFocus = (id: string) => setFocus((f) => (f === id ? null : id));

  const pressable = interactive && yourTurn && !busy;
  const onSelect = (sel: SelectEvent) => {
    if (!pressable) return;
    const moves = sweetlandsGlue.movesForSelect!(sel, input);
    if (moves.length === 1) onMove(moves[0]!);
  };

  return (
    <div className="sl-screen">
      <Players table={table} focus={focus} onFocus={onFocus} nameFor={nameFor} />
      <div className="sl-main">
        <Board table={table} pieces={piecesOn(table, focus, onFocus)} lit={lit} onTile={(id) => onSelect({ component: 'map', id, label: id })} />
        {/* Dice and Intel draws are resolved by the engine only when the person presses this. */}
        {onDraw && interactive && (
          <button type="button" className="btn big sl-draw" onClick={onDraw} disabled={busy}>
            {/draw|deal/i.test(sweetlandsGlue.resolveReportMove(input.legalMoves)?.description ?? '') ? 'Draw' : 'Roll'}
          </button>
        )}
        {table.me && (
          <Hand
            table={table} input={input} picked={picked} onPick={setPicked} pressable={pressable}
            formFor={(m) => sweetlandsGlue.formFor!(m, input)} onForm={onForm}
          />
        )}
        {menu}
      </div>
    </div>
  );
}
