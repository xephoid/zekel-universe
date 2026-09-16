import { describe, it, expect } from 'vitest';
import { ownsSeat, ownedSeatPositions, toWireEvent, type EventRow } from './events.js';

describe('seat ownership', () => {
  const seats = [
    { position: 0, kind: 'human', userId: 'u1', guestId: null },
    { position: 1, kind: 'human', userId: null, guestId: 'g9' },
    { position: 2, kind: 'ai', userId: null, guestId: null },
    { position: 3, kind: 'human', userId: null, guestId: null },
  ];

  it('matches a user seat to its user only', () => {
    expect(ownsSeat(seats[0]!, { kind: 'user', userId: 'u1' })).toBe(true);
    expect(ownsSeat(seats[0]!, { kind: 'user', userId: 'u2' })).toBe(false);
    expect(ownsSeat(seats[0]!, { kind: 'guest', guestId: 'u1' })).toBe(false);
  });

  it('matches a guest seat to its guest only', () => {
    expect(ownsSeat(seats[1]!, { kind: 'guest', guestId: 'g9' })).toBe(true);
    expect(ownsSeat(seats[1]!, { kind: 'guest', guestId: 'g8' })).toBe(false);
  });

  it('never matches an AI seat or an open seat', () => {
    expect(ownsSeat(seats[2]!, { kind: 'user', userId: 'u1' })).toBe(false);
    expect(ownsSeat(seats[2]!, { kind: 'guest', guestId: 'g9' })).toBe(false);
    expect(ownsSeat(seats[3]!, { kind: 'user', userId: 'u1' })).toBe(false);
  });

  it('lists all owned positions for a principal', () => {
    expect(ownedSeatPositions(seats, { kind: 'user', userId: 'u1' })).toEqual([0]);
    expect(ownedSeatPositions(seats, { kind: 'guest', guestId: 'nope' })).toEqual([]);
  });
});

describe('per-seat payload stripping', () => {
  const event: EventRow = {
    seq: 7,
    kind: 'move',
    actorSeatPosition: 0,
    summary: 'Seat 0 plays a card.',
    engineMove: { action: 'play' },
    payloads: {
      '0': { view: { hand: ['secret-a'] }, legalMoves: [{ move_id: 'x', move: { type: 'x' } }], yourTurn: true, playerId: 'p1' },
      '1': { view: { hand: ['secret-b'] }, legalMoves: [], yourTurn: false, playerId: 'p2' },
    },
    nextActorPosition: 0,
    gameOver: null,
    rewindToSeq: null,
    createdAt: '2026-09-16T00:00:00.000Z',
  };

  it('gives a seat only its own view and legal moves', () => {
    const wire = toWireEvent(event, 0);
    expect(wire.view).toEqual({ hand: ['secret-a'] });
    expect(wire.legalMoves).toHaveLength(1);
    expect(wire.yourTurn).toBe(true);
    expect(JSON.stringify(wire)).not.toContain('secret-b');
  });

  it('gives the other seat only its own view', () => {
    const wire = toWireEvent(event, 1);
    expect(wire.view).toEqual({ hand: ['secret-b'] });
    expect(wire.legalMoves).toEqual([]);
    expect(JSON.stringify(wire)).not.toContain('secret-a');
  });

  it('gives nobody nothing', () => {
    const wire = toWireEvent(event, null);
    expect(wire.view).toBeNull();
    const s = JSON.stringify(wire);
    expect(s).not.toContain('secret-a');
    expect(s).not.toContain('secret-b');
  });

  it('preserves the shared fields on the wire', () => {
    const wire = toWireEvent(event, 0);
    expect(wire.seq).toBe(7);
    expect(wire.kind).toBe('move');
    expect(wire.actorSeatPosition).toBe(0);
    expect(wire.summary).toBe('Seat 0 plays a card.');
    expect(wire.engineMove).toEqual({ action: 'play' });
    expect(wire.nextActorPosition).toBe(0);
  });
});
