import { describe, it, expect } from 'vitest';
import { ownsSeat, ownedSeatPositions, toWireEvent } from './events.js';

describe('seat ownership', () => {
  const seats = [
    { position: 0, kind: 'human', userId: 'u1', guestId: null },
    { position: 1, kind: 'human', userId: null, guestId: 'g9' },
    { position: 2, kind: 'ai', userId: null, guestId: null },
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

  it('never matches an AI seat', () => {
    expect(ownsSeat(seats[2]!, { kind: 'user', userId: 'u1' })).toBe(false);
    expect(ownsSeat(seats[2]!, { kind: 'guest', guestId: 'g9' })).toBe(false);
  });

  it('lists all owned positions for a principal', () => {
    expect(ownedSeatPositions(seats, { kind: 'user', userId: 'u1' })).toEqual([0]);
    expect(ownedSeatPositions(seats, { kind: 'guest', guestId: 'nope' })).toEqual([]);
  });
});

describe('per-seat view stripping', () => {
  const event = {
    seq: 7,
    kind: 'move',
    actorSeatPosition: 0,
    summary: 'Seat 0 plays a card.',
    engineMove: { action: 'play' },
    views: { '0': { hand: ['secret-a'] }, '1': { hand: ['secret-b'] }, public: { board: 1 } },
  };

  it('gives a seat only its own view', () => {
    const wire = toWireEvent(event, 0);
    expect(wire.view).toEqual({ hand: ['secret-a'] });
    expect(JSON.stringify(wire)).not.toContain('secret-b');
  });

  it('gives the other seat only its own view', () => {
    const wire = toWireEvent(event, 1);
    expect(wire.view).toEqual({ hand: ['secret-b'] });
    expect(JSON.stringify(wire)).not.toContain('secret-a');
  });

  it('gives a spectator the public view and no seat view', () => {
    const wire = toWireEvent(event, null, { board: 1 });
    expect(wire.view).toEqual({ board: 1 });
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
  });
});
