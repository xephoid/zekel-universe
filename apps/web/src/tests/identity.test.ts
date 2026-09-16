// Card identity across views: a played card keeps its instance when it
// moves from the hand to the played row; a drawn card is new and arrives
// from the deck; a tap on the third of three identical cards moves the third.

import { describe, expect, it } from 'vitest';
import { trackIdentities } from '../glue/identity';

const SOURCES = { hand: 'deck', discard: 'supply' };

describe('trackIdentities', () => {
  it('assigns fresh instances on the first view, arriving from the sources', () => {
    const s = trackIdentities('p1', null, { hand: ['focus', 'focus', 'attack'], played: [], discard: [] }, { sources: SOURCES });
    expect(s.zones['hand']).toHaveLength(3);
    expect(new Set(s.zones['hand']).size).toBe(3);
    for (const inst of s.zones['hand']!) expect(s.arrivals[inst]).toBe('deck');
  });

  it('keeps instances in place and carries a moved card across zones', () => {
    const a = trackIdentities('p1', null, { hand: ['focus', 'attack', 'focus'], played: [], discard: [] }, { sources: SOURCES });
    const attack = a.zones['hand']![1]!;
    const b = trackIdentities('p1', a, { hand: ['focus', 'focus'], played: ['attack'], discard: [] }, { sources: SOURCES });
    expect(b.zones['played']).toEqual([attack]);
    expect(b.zones['hand']).toEqual([a.zones['hand']![0], a.zones['hand']![2]]);
    expect(Object.keys(b.arrivals)).toHaveLength(0);
  });

  it('moves the hinted card when identical copies are in the hand', () => {
    const a = trackIdentities('p1', null, { hand: ['focus', 'focus', 'focus'], played: [], discard: [] }, { sources: SOURCES });
    const third = a.zones['hand']![2]!;
    const b = trackIdentities('p1', a, { hand: ['focus', 'focus'], played: ['focus'], discard: [] }, {
      sources: SOURCES, movedFrom: { zone: 'hand', index: 2 },
    });
    expect(b.zones['played']).toEqual([third]);
    expect(b.zones['hand']).toEqual([a.zones['hand']![0], a.zones['hand']![1]]);
  });

  it('a drawn card is new and comes from the deck; a bought card arrives in the discard from the supply', () => {
    const a = trackIdentities('p1', null, { hand: ['focus'], played: [], discard: [] }, { sources: SOURCES });
    const b = trackIdentities('p1', a, { hand: ['focus', 'misstep'], played: [], discard: ['block'] }, { sources: SOURCES });
    const drawn = b.zones['hand']![1]!;
    const bought = b.zones['discard']![0]!;
    expect(b.arrivals[drawn]).toBe('deck');
    expect(b.arrivals[bought]).toBe('supply');
    expect(b.zones['hand']![0]).toBe(a.zones['hand']![0]);
  });

  it('cleanup: the hand goes to the discard and the new hand comes from the deck', () => {
    const a = trackIdentities('p1', null, { hand: ['focus', 'attack'], played: ['block'], discard: [] }, { sources: SOURCES });
    const b = trackIdentities('p1', a, { hand: ['misstep', 'focus'], played: ['block'], discard: ['focus', 'attack'] }, { sources: SOURCES, clearedZones: ['hand'] });
    // The old hand's cards are now the discard's instances.
    expect(b.zones['discard']).toEqual([a.zones['hand']![0], a.zones['hand']![1]]);
    // The new focus in hand is a new draw, not the old one.
    expect(b.zones['hand']![1]).not.toBe(a.zones['hand']![0]);
    expect(b.arrivals[b.zones['hand']![0]!]).toBe('deck');
    expect(b.zones['played']).toEqual(a.zones['played']);
  });
});
