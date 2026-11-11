// The table socket after the server closes it (SEC-04-F12): sign-out,
// expiry and guest upgrade end a connection on the server. The client tries
// once more after a moment, so the browser's new cookies decide who it is,
// and a table opening on a closed connection asks for it again.

import { describe, expect, it, vi, afterEach } from 'vitest';

type Handler = (...args: unknown[]) => void;
class FakeIo {
  connected = false;
  active = false;
  connects = 0;
  handlers = new Map<string, Handler[]>();
  on(event: string, h: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]); return this; }
  off() { return this; }
  emit() { return this; }
  timeout() { return this; }
  connect() { this.connects++; return this; }
  fire(event: string, ...args: unknown[]) { for (const h of this.handlers.get(event) ?? []) h(...args); }
}

const made: FakeIo[] = [];
vi.mock('socket.io-client', () => ({ io: () => { const s = new FakeIo(); made.push(s); return s; } }));

afterEach(() => { vi.useRealTimers(); });

describe('the table socket', () => {
  it('reconnects once after the server closes it, opens a closed one for a table, and leaves a client-side close alone', async () => {
    vi.useFakeTimers();
    const { connectTable } = await import('../socket');
    const conn = connectTable('t1', { onEvent: () => {}, lastSeenSeq: () => 0 });
    const s = made[0]!;
    // Not connected and not trying: opening the table asks to connect.
    expect(s.connects).toBe(1);

    s.connected = false;
    s.fire('disconnect', 'io server disconnect');
    expect(s.connects).toBe(1);
    vi.advanceTimersByTime(600);
    expect(s.connects).toBe(2);

    // A disconnect the client chose, or a transport drop the client already
    // retries by itself, does not add a reconnect of its own.
    s.fire('disconnect', 'io client disconnect');
    s.fire('disconnect', 'transport close');
    vi.advanceTimersByTime(600);
    expect(s.connects).toBe(2);
    conn.close();
  });
});
