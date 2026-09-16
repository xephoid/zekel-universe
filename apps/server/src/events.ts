// Seat ownership and the per-seat view strip. This file carries the two
// invariants the whole realtime layer rests on: a connection may act only as
// a seat its owner owns, and a wire event carries only its owner's view.

import type { Principal } from './identity.js';
import type { TableEventWire, TableEventKind } from '@universe/shared';

export interface SeatRow {
  position: number;
  kind: string;
  userId: string | null;
  guestId: string | null;
}

/** True when this principal owns this seat. */
export function ownsSeat(seat: SeatRow, principal: Principal): boolean {
  if (seat.kind !== 'human') return false;
  if (principal.kind === 'user') return seat.userId === principal.userId;
  return seat.guestId === principal.guestId;
}

/** All seat positions the principal owns at this table. */
export function ownedSeatPositions(seats: SeatRow[], principal: Principal): number[] {
  return seats.filter((s) => ownsSeat(s, principal)).map((s) => s.position);
}

export interface EventRow {
  seq: number;
  kind: string;
  actorSeatPosition: number | null;
  summary: string;
  engineMove: Record<string, unknown> | null;
  /** Per-seat views keyed by seat position as string. Stripped before send. */
  views: Record<string, unknown>;
}

/**
 * Turn a stored event into what a connection may see. Seat views never
 * cross: the wire event carries the receiving seat's view only, and nothing
 * else from the views map.
 *
 * @param seatPosition the receiver's seat, or null for a spectator
 * @param publicView the engine's public view, for spectators (optional)
 */
export function toWireEvent(
  event: EventRow,
  seatPosition: number | null,
  publicView: unknown = null,
): TableEventWire {
  let view: unknown = null;
  if (seatPosition !== null) {
    view = event.views[String(seatPosition)] ?? null;
  } else {
    view = publicView;
  }
  return {
    seq: event.seq,
    kind: event.kind as TableEventKind,
    actorSeatPosition: event.actorSeatPosition,
    summary: event.summary,
    engineMove: event.engineMove,
    view,
  };
}
