// The playback queue. From the plan: events arrive as fast as the server
// produces them; the table plays them one at a time at the pace the person
// has chosen, with replay of the last move. Nothing skips to the end: the
// fastest pace still dwells on every event. Reduced motion changes how a
// move looks, never how long it takes.
//
// A framework-free class so the ordering is unit-testable without a DOM;
// the React hook in usePlaybackQueue.ts wraps it.

import type { TableEventWire } from '@universe/shared';

export type Pace = 0.5 | 1 | 2;
export const PACES: readonly Pace[] = [0.5, 1, 2];

/** Base dwell per event at 1×; slower on purpose: AI turns are a slideshow. */
export const BASE_MS = 1600;

export interface PlaybackState {
  /** events applied so far, in seq order */
  applied: TableEventWire[];
  /** the current view (last applied event's view) */
  view: unknown;
  /** the view before the current one, for the glue's motion hints */
  previousView: unknown;
  /** the event currently on screen */
  current: TableEventWire | null;
  /** the event shown before the current one */
  previous: TableEventWire | null;
  pending: number;
  done: boolean;
  lastSeq: number;
  /** increments on every apply, including replays, so the table re-animates */
  tick: number;
}

type Listener = (s: PlaybackState) => void;

/**
 * A gate runs before an event is applied and may hold it: the table uses
 * it to play a moment (a strike) over the board as it still is, then lets
 * the event land. The queue waits; nothing skips ahead.
 */
export type Gate = (next: TableEventWire, current: TableEventWire | null) => Promise<void>;

function initial(): PlaybackState {
  return { applied: [], view: null, previousView: null, current: null, previous: null, pending: 0, done: true, lastSeq: 0, tick: 0 };
}

export class PlaybackQueue {
  private queue: TableEventWire[] = [];
  private state: PlaybackState = initial();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAppliedAt = 0;
  private pace: Pace = 1;
  private gate: Gate | null = null;
  /** true while a gate holds the next event */
  private gating = false;
  private listeners = new Set<Listener>();
  /** Test hook: deterministic advance without timers. */
  public manual = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.snapshot;
    for (const fn of this.listeners) fn(snap);
  }

  setPace(p: Pace) {
    this.pace = p;
  }

  getPace(): Pace {
    return this.pace;
  }

  setGate(gate: Gate | null) {
    this.gate = gate;
  }

  /** Dwell for one event at the current pace. */
  dwellMs(): number {
    return BASE_MS / this.pace;
  }

  /**
   * Start from a known position without playing it back (a reload with a
   * saved snapshot, or a fresh device that was not watching).
   */
  seed(event: TableEventWire) {
    this.state = { ...initial(), applied: [event], view: event.view, current: event, lastSeq: event.seq, tick: this.state.tick + 1 };
    this.queue = [];
    this.emit();
  }

  /** Inbound wire events. Duplicates and already-shown events are dropped. */
  push(event: TableEventWire) {
    if (event.seq <= this.state.lastSeq) return;
    if (this.queue.some((e) => e.seq === event.seq)) return;
    this.queue.push(event);
    this.queue.sort((a, b) => a.seq - b.seq);
    this.state = { ...this.state, pending: this.queue.length, done: false };
    this.emit();
    this.schedule();
  }

  /** An event plays as soon as the one before it has had its dwell: a
   *  person's own move lands at once on an idle board, and a run of AI
   *  moves is paced one dwell apart. */
  private schedule() {
    if (this.manual) return;
    if (this.timer !== null || this.gating) return;
    if (this.queue.length === 0) return;
    const since = Date.now() - this.lastAppliedAt;
    const ms = this.state.current === null ? 0 : Math.max(0, this.dwellMs() - since);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.advanceThroughGate();
    }, ms);
  }

  /** The timed path: let the gate see the next event first, then apply it. */
  private async advanceThroughGate() {
    const next = this.queue[0];
    if (!next || !this.gate) { this.advance(); return; }
    this.gating = true;
    try {
      await this.gate(next, this.state.current);
    } finally {
      this.gating = false;
    }
    // Only apply if the queue still starts with what the gate saw.
    if (this.queue[0] === next) this.advance();
    else this.schedule();
  }

  /** Apply the next queued event. Returns the event applied, or null. */
  advance(): TableEventWire | null {
    const next = this.queue.shift();
    if (!next) {
      this.state = { ...this.state, pending: 0, done: true };
      this.emit();
      return null;
    }
    this.apply(next);
    this.schedule();
    return next;
  }

  private apply(next: TableEventWire) {
    this.lastAppliedAt = Date.now();
    const applied = [...this.state.applied, next];
    this.state = {
      ...this.state,
      applied,
      previousView: this.state.view,
      view: next.view,
      previous: this.state.current,
      current: next,
      pending: this.queue.length,
      done: this.queue.length === 0,
      lastSeq: Math.max(this.state.lastSeq, next.seq),
      tick: this.state.tick + 1,
    };
    this.emit();
  }

  /**
   * Replay the last move: show the board as it was before the current
   * event, then the current event again after one dwell. The queue of
   * unplayed events waits until the replay lands.
   */
  replayLast() {
    const { current, previous } = this.state;
    if (!current) return;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    const before = previous ?? null;
    this.state = {
      ...this.state,
      view: before?.view ?? null,
      previousView: null,
      current: before,
      previous: null,
      applied: this.state.applied.filter((e) => e.seq < current.seq),
      tick: this.state.tick + 1,
    };
    this.emit();
    const again = async () => {
      if (this.gate) {
        this.gating = true;
        try { await this.gate(current, this.state.current); } finally { this.gating = false; }
      }
      this.apply(current);
      this.schedule();
    };
    if (this.manual) {
      this.queue.unshift(current);
      this.state = { ...this.state, pending: this.queue.length, done: false };
    } else {
      this.timer = setTimeout(() => { this.timer = null; void again(); }, this.dwellMs());
    }
  }

  /** After reconnect: the caller pushes the events it missed; the queue resumes. */
  resumeFrom(events: TableEventWire[]) {
    for (const e of events) this.push(e);
  }

  get snapshot(): PlaybackState {
    return { ...this.state, applied: [...this.state.applied] };
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }
}
