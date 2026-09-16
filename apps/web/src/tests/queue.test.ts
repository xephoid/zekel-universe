// Queue ordering tests: events arrive fast, play one at a time in seq order,
// replay repeats the last move, resume picks up after lastSeq, and no pace
// skips to the end.

import { describe, expect, it } from 'vitest';
import { BASE_MS, PACES, PlaybackQueue } from '../playback/PlaybackQueue';
import { ev } from './fixtures';

describe('playback queue', () => {
  it('applies events strictly in seq order, one at a time', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    const seen: string[] = [];
    q.subscribe((s) => {
      const c = s.current;
      if (c && seen.at(-1) !== c.summary) seen.push(c.summary);
    });
    q.push(ev(1, 'a'));
    q.push(ev(3, 'c'));
    q.push(ev(2, 'b')); // out-of-order arrival still sorts
    while (q.snapshot.pending > 0) q.advance();
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(q.snapshot.lastSeq).toBe(3);
  });

  it('carries the previous view for motion', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    q.push(ev(1, 'a'));
    q.push(ev(2, 'b'));
    q.advance();
    expect((q.snapshot.view as { tag: string }).tag).toBe('a');
    q.advance();
    expect((q.snapshot.view as { tag: string }).tag).toBe('b');
    expect((q.snapshot.previousView as { tag: string }).tag).toBe('a');
  });

  it('replay shows the board before the last move, then the move again', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    [1, 2, 3].forEach((s) => q.push(ev(s, `e${s}`)));
    while (q.snapshot.pending > 0) q.advance();
    q.replayLast();
    expect(q.snapshot.current?.summary).toBe('e2');
    expect((q.snapshot.view as { tag: string }).tag).toBe('e2');
    expect(q.snapshot.pending).toBe(1);
    q.advance();
    expect(q.snapshot.current?.summary).toBe('e3');
    expect(q.snapshot.applied.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(q.snapshot.lastSeq).toBe(3);
  });

  it('seeding starts from a known position without playing it back', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    q.seed(ev(7, 'saved'));
    expect(q.snapshot.current?.seq).toBe(7);
    expect(q.snapshot.pending).toBe(0);
    q.push(ev(7, 'dup'));
    q.push(ev(5, 'old'));
    expect(q.snapshot.pending).toBe(0);
    q.push(ev(8, 'next'));
    expect(q.snapshot.pending).toBe(1);
  });

  it('resumeFrom after a reconnect adds only newer events and continues', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    q.push(ev(1, 'a'));
    q.push(ev(2, 'b'));
    q.advance();
    q.advance();
    q.resumeFrom([ev(2, 'b-again'), ev(3, 'c'), ev(4, 'd')]);
    const seen: string[] = [];
    while (q.snapshot.pending > 0) seen.push(q.advance()!.summary);
    expect(seen).toEqual(['c', 'd']);
    expect(q.snapshot.lastSeq).toBe(4);
  });

  it('ignores duplicate seq numbers', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    q.push(ev(1, 'a'));
    q.advance();
    q.push(ev(1, 'a-again'));
    expect(q.snapshot.pending).toBe(0);
  });

  it('has no pace that skips to the end: every pace dwells on every event', () => {
    for (const p of PACES) {
      const q = new PlaybackQueue();
      q.setPace(p);
      expect(q.dwellMs()).toBeGreaterThanOrEqual(BASE_MS / 2);
      expect(q.dwellMs()).toBeGreaterThan(0);
    }
    expect(PACES).not.toContain('instant' as never);
  });
});
