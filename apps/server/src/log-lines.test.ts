// The engine's log entries a table keeps with each event: well formed and
// bounded, anything else dropped.

import { describe, expect, it } from 'vitest';
import { logLinesOf } from './realtime.js';

describe('logLinesOf', () => {
  it("keeps each well-formed entry, named in the table's own fields", () => {
    expect(logLinesOf([
      { seq: 3, turn: 2, category: 'destroyed', actor: null, summary: 'A base is destroyed', headline: 'Their base was destroyed', subject: 'p1', subject_headline: 'Your base was destroyed!', tone: 'loss' },
      { seq: 4, turn: 2, category: 'payment', actor: 'p2', summary: 'p2 commits 2 collectors' },
    ])).toEqual([
      { seq: 3, round: 2, category: 'destroyed', actor: null, summary: 'A base is destroyed', headline: 'Their base was destroyed', subject: 'p1', subjectHeadline: 'Your base was destroyed!', loss: true },
      { seq: 4, round: 2, category: 'payment', actor: 'p2', summary: 'p2 commits 2 collectors' },
    ]);
  });

  it('drops malformed entries and bounds every text', () => {
    const out = logLinesOf([
      'text', null, { summary: 'no seq' }, { seq: 1 },
      { seq: 2, summary: 'x'.repeat(2000), headline: 'h'.repeat(500), subject: 'p1', tone: 'loss' },
      ...Array.from({ length: 300 }, (_, i) => ({ seq: 10 + i, summary: `line ${i}` })),
    ]);
    expect(out[0]!.summary).toHaveLength(1000);
    expect(out[0]!.headline).toHaveLength(200);
    // A subject without its own line, or a loss without a subject, is not kept.
    expect(out[0]!.subject).toBeUndefined();
    expect(out[0]!.loss).toBeUndefined();
    expect(out.length).toBeLessThanOrEqual(200);
    expect(logLinesOf('nope')).toEqual([]);
    // The seats to tell: a bounded list of ids; anything else is dropped.
    const told = logLinesOf([{ seq: 1, summary: 's', notify: ['p1', 7, 'x'.repeat(99), ...Array.from({ length: 20 }, (_, i) => `p${i}`)] }]);
    expect(told[0]!.notify!.length).toBeLessThanOrEqual(10);
    expect(told[0]!.notify![0]).toBe('p1');
    expect(told[0]!.notify!.every((x) => typeof x === 'string' && x.length <= 40)).toBe(true);
  });
});
