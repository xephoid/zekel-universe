// What every NGnG screen is handed: the read view, the route, the seat, the
// printed catalogue, and the two ways to send (a listed move, or a listed
// template the person completed). Screens never touch raw JSON or the socket.

import type { GameScreenProps, LegalMove } from '../types';
import { labelOf, moveType, playerOf, type NggPlayer, type NggView } from './read';
import { readRef, type NggRef } from './ref';
import type { Route } from './route';

export interface ScreenCtx {
  v: NggView;
  me: string | null;
  mine: NggPlayer | null;
  route: Route;
  legal: LegalMove[];
  ref: NggRef | null;
  /** controls are live: this seat's decision, a move not in flight, not a watcher page */
  live: boolean;
  /** the seat's scratch space across events (composer stages live here) */
  memory: Map<string, unknown>;
  send(move: LegalMove): void;
  sendForm(template: LegalMove, move: Record<string, unknown>, editableKeys: string[]): void;
  /** press Draw: the table sends the listed resolve_report; null when none is listed */
  draw: (() => void) | null;
  /** ask the engine a read-only question about this decision; null where no live table can answer */
  ask: ((name: string, args: Record<string, unknown>) => Promise<{ answer: unknown } | { refused: string }>) | null;
  /** a seat's faction name, or its display name before it has one */
  seat(playerId: string | null | undefined): string;
  /** the person at a seat, by display name */
  person(playerId: string | null | undefined): string;
  /** "D4" for a coord */
  tile(coord: string | null | undefined): string;
  /** the listed moves of one type */
  movesOf(type: string): LegalMove[];
  /**
   * An engine sentence (a shut option's reason, a move's description) for a
   * person: seat ids and "c,r" coords shown as faction names and tile labels.
   * A display swap only; nothing is read out of the sentence.
   */
  say(text: string): string;
}

export function makeCtx(props: GameScreenProps, v: NggView, route: Route): ScreenCtx {
  const { input } = props;
  const me = input.playerId;
  const legal = props.yourTurn ? input.legalMoves : [];
  return {
    v,
    me,
    mine: playerOf(v, me),
    route,
    legal,
    ref: readRef(input.reference),
    live: props.interactive && props.yourTurn && !props.busy,
    memory: input.memory,
    send: props.onMove,
    sendForm: props.onForm,
    draw: props.yourTurn && props.interactive && props.onDraw ? props.onDraw : null,
    ask: props.yourTurn && props.interactive && props.ask ? props.ask : null,
    seat: (pid) => {
      if (!pid) return '';
      const p = playerOf(v, pid);
      return p?.faction ?? props.nameFor(pid);
    },
    person: (pid) => (pid ? props.nameFor(pid) : ''),
    tile: (coord) => labelOf(v, coord ?? null),
    movesOf: (type) => legal.filter((m) => moveType(m.move) === type),
    say: (text) => sayFor(v, text, (pid) => playerOf(v, pid)?.faction ?? props.nameFor(pid)),
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sayFor(v: NggView, text: string, seat: (pid: string) => string): string {
  let out = text;
  for (const p of v.players) {
    if (!p.id) continue;
    out = out.replace(new RegExp(`(^|[^\\w-])${escapeRegExp(p.id)}(?![\\w-])`, 'g'), (_m, pre: string) => `${pre}${seat(p.id)}`);
  }
  return out.replace(/-?\d+,-?\d+/g, (c) => (v.tiles.some((t) => t.coord === c) ? labelOf(v, c) : c));
}
