// Queue ordering tests: events arrive fast, play one at a time in seq order,
// replay repeats the last move, resume picks up after lastSeq, and no pace
// skips to the end.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_MS, PACES, PlaybackQueue } from '../playback/PlaybackQueue';
import { ev } from './fixtures';

describe('playback queue', () => {
  afterEach(() => { vi.useRealTimers(); });
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

  it('a gate holds the next event until it resolves, and nothing skips past it', async () => {
    vi.useFakeTimers();
    const q = new PlaybackQueue();
    q.setPace(2);
    q.seed(ev(1, 'a'));
    let release: (() => void) | null = null;
    const seen: Array<[number, number | null]> = [];
    q.setGate((next, current) => new Promise<void>((resolve) => { seen.push([next.seq, current?.seq ?? null]); release = resolve; }));
    q.push(ev(2, 'b'));
    q.push(ev(3, 'c'));
    await vi.advanceTimersByTimeAsync(BASE_MS);
    // The gate saw b against a; b has not landed.
    expect(seen).toEqual([[2, 1]]);
    expect(q.snapshot.current?.summary).toBe('a');
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(q.snapshot.current?.summary).toBe('b');
    // Then c waits for its own dwell and its own gate.
    await vi.advanceTimersByTimeAsync(BASE_MS);
    expect(seen).toEqual([[2, 1], [3, 2]]);
    expect(q.snapshot.current?.summary).toBe('b');
    release!();
    await vi.advanceTimersByTimeAsync(0);
    expect(q.snapshot.current?.summary).toBe('c');
    expect(q.snapshot.done).toBe(true);
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
