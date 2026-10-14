// Seat ownership and the per-seat strip. This file carries the two
// invariants the whole realtime layer rests on: a connection may act only as
// a seat its owner owns, and a wire event carries only its owner's payload.

import type { Principal } from './identity.js';
import type { GameOverResult, LogLine, SeatPayload, TableEventKind, TableEventWire } from '@universe/shared';

export interface SeatRow {
  position: number;
  kind: string;
  userId: string | null;
  guestId: string | null;
}

/** True when this principal owns this seat. */
export function ownsSeat(seat: SeatRow, principal: Principal): boolean {
  if (seat.kind !== 'human') return false;
  if (principal.kind === 'user') return seat.userId !== null && seat.userId === principal.userId;
  return seat.guestId !== null && seat.guestId === principal.guestId;
}

/** All seat positions the principal owns at this table. */
export function ownedSeatPositions(seats: SeatRow[], principal: Principal): number[] {
  return seats.filter((s) => ownsSeat(s, principal)).map((s) => s.position);
}

/** A stored event with every seat's payload; never leaves the server whole. */
export interface EventRow {
  seq: number;
  kind: TableEventKind;
  actorSeatPosition: number | null;
  summary: string;
  engineMove: Record<string, unknown> | null;
  /** Per-seat payloads keyed by seat position as a string. */
  payloads: Record<string, SeatPayload>;
  nextActorPosition: number | null;
  gameOver: GameOverResult | null;
  rewindToSeq: number | null;
  createdAt: string;
  /** the engine's log entries this event produced; public, the same for every seat */
  logEntries: LogLine[];
}

/**
 * Turn a stored event into what one seat may see. Payloads never cross:
 * the wire event carries the receiving seat's entry only, and nothing else
 * from the payload map. A null seat (nobody) gets no view at all.
 *
 * The raw engine move goes only to the seat that made it. A move can carry
 * a choice the engine keeps secret from the other players (Neither Guts nor
 * Gears' spy or battle card), so every other seat, and every seat for an AI
 * move, gets null and reads what happened from the summary, the log and its
 * own view.
 */
export function toWireEvent(event: EventRow, seatPosition: number | null): TableEventWire {
  const payload = seatPosition === null ? undefined : event.payloads[String(seatPosition)];
  return {
    seq: event.seq,
    kind: event.kind,
    actorSeatPosition: event.actorSeatPosition,
    summary: event.summary,
    engineMove: seatPosition !== null && event.actorSeatPosition === seatPosition ? event.engineMove : null,
    view: payload?.view ?? null,
    legalMoves: payload?.legalMoves ?? [],
    unavailable: payload?.unavailable ?? [],
    log: event.logEntries,
    moveMenu: payload?.moveMenu ?? null,
    briefing: payload?.briefing ?? null,
    yourTurn: payload?.yourTurn ?? false,
    playerId: payload?.playerId ?? null,
    nextActorPosition: event.nextActorPosition,
    gameOver: event.gameOver,
    rewindToSeq: event.rewindToSeq,
    createdAt: event.createdAt,
  };
}
