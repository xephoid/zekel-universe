// The playback queue. From the plan: events arrive as fast as the server
// produces them; the table plays them one at a time at the pace the person
// has chosen, with replay-from-start; nothing skips to the end. Rewriting as
// a framework-free class so the queue's ordering is unit-testable without a
// DOM; the React hook in usePlaybackQueue.ts wraps it.

import type { TableEventWire } from '@universe/shared';

export type Pace = 0.5 | 1 | 2 | 'instant';

/** Base dwell per event at 1×; slower on purpose — AI turns are a slideshow. */
const BASE_MS = 1600;

export interface PlaybackState<T = unknown> {
  /** events applied so far, in seq order */
  applied: TableEventWire[];
  /** the current view (last applied event's view) */
  view: T | null;
  /** previous view for FLIP animation */
  previousView: T | null;
  /** the event currently on screen */
  current: TableEventWire | null;
  pending: number;
  done: boolean;
  lastSeq: number;
}

type Listener = (s: PlaybackState) => void;

export class PlaybackQueue {
  private queue: TableEventWire[] = [];
  private state: PlaybackState = { applied: [], view: null, previousView: null, current: null, pending: 0, done: true, lastSeq: 0 };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pace: Pace = 1;
  private listeners = new Set<Listener>();
  /** Test hook: deterministic advance without timers. */
  public manual = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn({ ...this.state, applied: [...this.state.applied] });
  }

  setPace(p: Pace) {
    this.pace = p;
  }
  getPace(): Pace {
    return this.pace;
  }

  /** Inbound wire events. seq strictly increasing; gaps allowed (reconnect
   *  fetches fill them via resumeFrom). */
  push(event: TableEventWire) {
    if (event.seq <= this.state.lastSeq && this.state.applied.some((e) => e.seq === event.seq)) return;
    this.queue.push(event);
    this.queue.sort((a, b) => a.seq - b.seq);
    this.state.pending = this.queue.length;
    this.state.done = false;
    this.emit();
    this.schedule();
  }

  private schedule() {
    if (this.manual) return;
    if (this.timer !== null) return;
    if (this.queue.length === 0) return;
    const ms = this.pace === 'instant' ? 0 : BASE_MS / this.pace;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.advance();
    }, ms);
  }

  /** Apply the next queued event. Returns the event applied, or null. */
  advance(): TableEventWire | null {
    const next = this.queue.shift();
    if (!next) {
      this.state.pending = 0;
      this.state.done = true;
      this.emit();
      return null;
    }
    const previousView = (this.state.current?.view ?? this.state.view ?? null) as unknown;
    this.state = {
      ...this.state,
      applied: [...this.state.applied, next],
      previousView: (this.state.view ?? previousView) as never,
      view: next.view as never,
      current: next,
      pending: this.queue.length,
      done: this.queue.length === 0,
      lastSeq: next.seq,
    };
    this.emit();
    this.schedule();
    return next;
  }

  /** Replay from the first applied event: resets visible state and re-queues
   *  everything (server fetch not needed — we keep applied events). */
  replayFromStart() {
    const all = [...this.state.applied, ...this.queue].sort((a, b) => a.seq - b.seq);
    this.queue = all;
    this.state = { applied: [], view: null, previousView: null, current: null, pending: all.length, done: all.length === 0, lastSeq: all.length ? all[0]!.seq - 1 : 0 };
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.emit();
    this.schedule();
  }

  /** After reconnect: the caller fetches events after lastSeq and pushes
   *  them; the queue simply resumes. */
  resumeFrom(events: TableEventWire[]) {
    for (const e of events) this.push(e);
  }

  get snapshot(): PlaybackState {
    return { ...this.state, applied: [...this.state.applied] };
  }

  dispose() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.listeners.clear();
  }
}
