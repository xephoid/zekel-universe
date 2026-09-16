// Queue ordering tests: events arrive fast, play one at a time in seq order,
// replay rewinds, resume picks up after lastSeq.

import { describe, expect, it } from 'vitest';
import { PlaybackQueue } from '../playback/PlaybackQueue';
import type { TableEventWire } from '@universe/shared';

function ev(seq: number, tag: string): TableEventWire {
  return { seq, kind: 'move', actorSeatPosition: 0, summary: tag, engineMove: null, view: { tag } };
}

describe('playback queue', () => {
  it('applies events strictly in seq order, one at a time', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    const seen: string[] = [];
    q.subscribe(() => {
      const c = q.snapshot.current;
      if (c && seen.at(-1) !== c.summary) seen.push(c.summary);
    });
    q.push(ev(1, 'a'));
    q.push(ev(3, 'c'));
    q.push(ev(2, 'b')); // out-of-order arrival still sorts
    while (q.snapshot.pending > 0) q.advance();
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(q.snapshot.lastSeq).toBe(3);
  });

  it('carries the previous view for FLIP animation', () => {
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

  it('replay from start rewinds and re-shows every event', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    [1, 2, 3].forEach((s) => q.push(ev(s, `e${s}`)));
    while (q.snapshot.pending > 0) q.advance();
    expect(q.snapshot.applied).toHaveLength(3);
    q.replayFromStart();
    expect(q.snapshot.applied).toHaveLength(0);
    expect(q.snapshot.pending).toBe(3);
    const seen: string[] = [];
    while (q.snapshot.pending > 0) seen.push(q.advance()!.summary);
    expect(seen).toEqual(['e1', 'e2', 'e3']);
  });

  it('resumeFrom after a reconnect adds only newer events and continues', () => {
    const q = new PlaybackQueue();
    q.manual = true;
    q.push(ev(1, 'a'));
    q.push(ev(2, 'b'));
    q.advance();
    q.advance();
    // reconnect: server returns events after seq 2
    q.resumeFrom([ev(3, 'c'), ev(4, 'd')]);
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
});
