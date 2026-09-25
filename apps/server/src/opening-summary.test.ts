// The opening log entry carries what the engine logged while the table was
// set up, so an AI seat's draft pick made before any person moved is not lost.

import { describe, expect, it } from 'vitest';
import { openingSummary } from './realtime.js';

describe('openingSummary', () => {
  it('is the plain opening line when the engine logged nothing', () => {
    expect(openingSummary([])).toBe('The table is set.');
    expect(openingSummary(undefined)).toBe('The table is set.');
  });

  it("adds each logged line, in order, as a sentence", () => {
    expect(openingSummary([
      { summary: 'The Ledger takes Foreman Hadrik Stoll as Leader (+2 DEF)' },
      { summary: 'Round 1 begins.' },
    ])).toBe('The table is set. The Ledger takes Foreman Hadrik Stoll as Leader (+2 DEF). Round 1 begins.');
  });

  it('keeps only well-formed, bounded entries', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ summary: `line ${i}` }));
    const out = openingSummary([{ nope: 1 }, 'text', { summary: '' }, { summary: 'x'.repeat(500) }, ...many]);
    expect(out).toContain(`${'x'.repeat(300)}.`);
    expect(out).not.toContain('x'.repeat(301));
    expect(out).toContain('line 15.');
    expect(out).not.toContain('line 16.');
  });
});
