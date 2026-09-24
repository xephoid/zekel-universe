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
  /** a seat's faction name, or its display name before it has one */
  seat(playerId: string | null | undefined): string;
  /** "D4" for a coord */
  tile(coord: string | null | undefined): string;
  /** the listed moves of one type */
  movesOf(type: string): LegalMove[];
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
    seat: (pid) => {
      if (!pid) return '';
      const p = playerOf(v, pid);
      return p?.faction ?? props.nameFor(pid);
    },
    tile: (coord) => labelOf(v, coord ?? null),
    movesOf: (type) => legal.filter((m) => moveType(m.move) === type),
  };
}
