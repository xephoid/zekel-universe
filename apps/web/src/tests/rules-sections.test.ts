// The rules page splits the engine's rules text at "## " lines into sections
// with a table of contents; text with no headings is shown as it came.

import { describe, expect, it } from 'vitest';
import { splitRulesSections } from '../pages/Rules';

describe('splitRulesSections', () => {
  it('splits an intro and three sections', () => {
    const text = 'MY GAME v1.0\n\n## Setup\n\nShuffle the deck.\n\nDeal five cards.\n\n## On Your Turn\nDraw, then play.\n---\n## Winning & Scoring!\n\nMost points wins.\n';
    const { intro, sections } = splitRulesSections(text);
    expect(intro).toEqual(['MY GAME v1.0']);
    expect(sections.map((s) => s.heading)).toEqual(['Setup', 'On Your Turn', 'Winning & Scoring!']);
    expect(sections.map((s) => s.slug)).toEqual(['setup', 'on-your-turn', 'winning-scoring']);
    expect(sections.map((s) => s.paragraphs)).toEqual([
      ['Shuffle the deck.', 'Deal five cards.'],
      ['Draw, then play.'],
      ['Most points wins.'],
    ]);
  });

  it('returns no sections when there is no "## " heading', () => {
    const text = 'HOW TO RUN THIS GAME\n\n1. Setup.\n- a bullet\n---\nNot a ##heading either.';
    const { intro, sections } = splitRulesSections(text);
    expect(sections).toEqual([]);
    expect(intro.length).toBeGreaterThan(0);
  });

  it('handles a first line that is a heading (no intro)', () => {
    const { intro, sections } = splitRulesSections('## TITLE — v2\n\nBody text.\n\n## Setup\n\nMore.\n\n## Setup\nAgain.');
    expect(intro).toEqual([]);
    expect(sections.map((s) => s.slug)).toEqual(['title-v2', 'setup', 'setup-2']);
    expect(sections.map((s) => s.paragraphs)).toEqual([['Body text.'], ['More.'], ['Again.']]);
  });
});
