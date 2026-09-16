// Table lifecycle: create (vs AI or with friends), join, ready, start.
// Vs-AI tables create the engine session immediately and start playing;
// friends tables sit in the lobby until the start conditions below fire.

import { eq, and, asc } from 'drizzle-orm';
import type { DatabaseClient } from '../db/index.js';
import { tables, seats, games } from '../db/schema.js';
import { newId, now, type Principal } from '../identity.js';
import { encryptToken, decryptToken } from '../crypto.js';
import type { EngineService } from '../engine.js';
import type { TableStatus, TableMode } from '@universe/shared';

export class TableError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TableError';
  }
}

export interface SeatSpec {
  kind: 'human' | 'ai';
  aiDifficulty?: string;
  setupChoices?: Record<string, unknown>;
}

export interface CreateTableArgs {
  gameId: string;
  mode: TableMode;
  /** Every seat at the table. The caller's seat is marked by hostPosition. */
  seatSpecs: SeatSpec[];
  hostPosition: number;
}

export class TableService {
  private startedListeners: Array<(tableId: string) => void> = [];

  constructor(
    private db: DatabaseClient,
    private engine: EngineService,
    private secretKey: string,
  ) {}

  /** Realtime registers here so a proactive opening turn can be pushed. */
  onStarted(listener: (tableId: string) => void): void {
    this.startedListeners.push(listener);
  }

  private emitStarted(tableId: string): void {
    for (const l of this.startedListeners) l(tableId);
  }

  getTable(tableId: string) {
    return this.db.select().from(tables).where(eq(tables.id, tableId)).get();
  }

  getSeats(tableId: string) {
    return this.db.select().from(seats)
      .where(eq(seats.tableId, tableId))
      .orderBy(asc(seats.position))
      .all();
  }

  /**
   * Create a table. Against AI only: the engine session is created now with
   * every human seat digital, and the table starts playing. With any friend
   * seat (a human seat that is not the host): the table enters the lobby.
   */
  async createTable(principal: Principal, args: CreateTableArgs) {
    const game = this.db.select().from(games)
      .where(eq(games.engineGameId, args.gameId)).get();
    if (!game) throw new TableError('unknown_game', `No game ${args.gameId}`);
    if (args.seatSpecs.length === 0) throw new TableError('no_seats', 'A table needs seats');
    if (args.hostPosition < 0 || args.hostPosition >= args.seatSpecs.length) {
      throw new TableError('bad_host_position', 'Host position is not a seat');
    }
    if (args.seatSpecs[args.hostPosition]!.kind !== 'human') {
      throw new TableError('bad_host_position', 'The host seat must be human');
    }
    const hasFriendSeat = args.seatSpecs.some((s, i) => s.kind === 'human' && i !== args.hostPosition);

    const tableId = newId();
    const friendTable = hasFriendSeat;
    this.db.insert(tables).values({
      id: tableId,
      gameId: args.gameId,
      hostUserId: principal.kind === 'user' ? principal.userId : null,
      hostGuestId: principal.kind === 'guest' ? principal.guestId : null,
      mode: args.mode,
      status: friendTable ? 'lobby' : 'lobby', // set below for vs-AI
      createdAt: now(),
    }).run();

    args.seatSpecs.forEach((spec, position) => {
      const isHost = position === args.hostPosition;
      this.db.insert(seats).values({
        id: newId(),
        tableId,
        position,
        kind: spec.kind,
        userId: isHost && principal.kind === 'user' ? principal.userId : null,
        guestId: isHost && principal.kind === 'guest' ? principal.guestId : null,
        aiDifficulty: spec.aiDifficulty ?? null,
        setupChoices: spec.setupChoices ?? {},
        ready: isHost,
      }).run();
    });

    if (!friendTable) {
      await this.startEngineSession(tableId);
      this.db.update(tables).set({ status: 'playing' }).where(eq(tables.id, tableId)).run();
    }

    return { tableId, status: (friendTable ? 'lobby' : 'playing') as TableStatus };
  }

  /** Create the engine session with every human seat digital, and store tokens. */
  private async startEngineSession(tableId: string): Promise<void> {
    const table = this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    const tableSeats = this.getSeats(tableId);
    const hostPosition = tableSeats.find((s) =>
      table.hostUserId ? s.userId === table.hostUserId : s.guestId === table.hostGuestId)?.position ?? 0;
    const session = await this.engine.createSession({
      gameId: table.gameId,
      seats: tableSeats.map((s) => ({
        kind: s.kind as 'human' | 'ai',
        table: s.kind === 'human' ? ('digital' as const) : undefined,
        difficulty: s.aiDifficulty ?? undefined,
      })),
      options: tableSeats[0]?.setupChoices ?? {},
      hostPlayerId: `p${hostPosition + 1}`,
    });
    for (const engineSeat of session.seats ?? []) {
      const seat = tableSeats.find((s) => s.position === engineSeat.position);
      if (seat && engineSeat.player_id) {
        this.db.update(seats)
          .set({ enginePlayerId: engineSeat.player_id })
          .where(eq(seats.id, seat.id)).run();
      }
    }
    if (session.host_token) {
      this.db.update(tables).set({
        engineSessionId: session.session_id,
        encryptedHostToken: encryptToken(session.host_token, this.secretKey),
      }).where(eq(tables.id, tableId)).run();
    } else {
      // Token comes back on the session; if absent, use the per-seat token of
      // the host seat (the engine hands one per player).
      const hostToken = session.seats?.find((s) => s.position === hostPosition)?.token ?? null;
      this.db.update(tables).set({
        engineSessionId: session.session_id,
        encryptedHostToken: hostToken ? encryptToken(hostToken, this.secretKey) : null,
      }).where(eq(tables.id, tableId)).run();
    }
    this.emitStarted(tableId);
  }

  /** The engine's player id for a seat position at this table. */
  playerIdFor(tableId: string, position: number): string {
    const seat = this.getSeats(tableId).find((s) => s.position === position);
    return seat?.enginePlayerId ?? `p${position + 1}`;
  }

  /** Take the first open (or own) human lobby seat. Guests join by link. */
  joinTable(principal: Principal, tableId: string) {
    const table = this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    if (table.status !== 'lobby') throw new TableError('not_joinable', 'Table is not in the lobby');
    const tableSeats = this.getSeats(tableId);

    const already = tableSeats.find((s) =>
      s.kind === 'human' &&
      (principal.kind === 'user' ? s.userId === principal.userId : s.guestId === principal.guestId));
    if (already) return { seatPosition: already.position };

    const open = tableSeats.find((s) => s.kind === 'human' && !s.userId && !s.guestId);
    if (!open) throw new TableError('table_full', 'No open seats');
    this.db.update(seats).set({
      userId: principal.kind === 'user' ? principal.userId : null,
      guestId: principal.kind === 'guest' ? principal.guestId : null,
    }).where(eq(seats.id, open.id)).run();

    this.maybeAutoStartTurns(tableId);
    return { seatPosition: open.position };
  }

  setReady(principal: Principal, tableId: string, ready: boolean) {
    const table = this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    const tableSeats = this.getSeats(tableId);
    const mine = tableSeats.find((s) =>
      s.kind === 'human' &&
      (principal.kind === 'user' ? s.userId === principal.userId : s.guestId === principal.guestId));
    if (!mine) throw new TableError('not_seated', 'You hold no seat at this table');
    this.db.update(seats).set({ ready }).where(eq(seats.id, mine.id)).run();
    this.maybeAutoStartTurns(tableId);
    return { position: mine.position, ready };
  }

  /** Host starts a live table once every human seat is ready. */
  async startTable(principal: Principal, tableId: string) {
    const table = this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    const isHost = principal.kind === 'user'
      ? table.hostUserId === principal.userId
      : table.hostGuestId === principal.guestId;
    if (!isHost) throw new TableError('not_host', 'Only the host can start the table');
    if (table.status !== 'lobby') throw new TableError('already_started', 'Table already started');
    const tableSeats = this.getSeats(tableId);
    const humanSeats = tableSeats.filter((s) => s.kind === 'human');
    if (humanSeats.some((s) => !s.userId && !s.guestId)) {
      throw new TableError('open_seats', 'Every human seat must be taken');
    }
    if (humanSeats.some((s) => !s.ready)) {
      throw new TableError('not_ready', 'Every player must be ready');
    }
    await this.startEngineSession(tableId);
    this.db.update(tables).set({ status: 'playing' }).where(eq(tables.id, tableId)).run();
    return { tableId, status: 'playing' as TableStatus };
  }

  /** By-turns tables start themselves once every human seat is taken. */
  private maybeAutoStartTurns(tableId: string): void {
    const table = this.getTable(tableId);
    if (!table || table.status !== 'lobby' || table.mode !== 'turns') return;
    const tableSeats = this.getSeats(tableId);
    const humanSeats = tableSeats.filter((s) => s.kind === 'human');
    if (humanSeats.length === 0) return;
    if (humanSeats.every((s) => s.userId || s.guestId)) {
      void this.startEngineSession(tableId)
        .then(() => {
          this.db.update(tables).set({ status: 'playing' }).where(eq(tables.id, tableId)).run();
        })
        .catch((err) => console.error('[tables] auto-start failed:', err));
    }
  }

  /** Decrypt the stored engine host token for this table. */
  hostToken(tableId: string): string {
    const table = this.getTable(tableId);
    if (!table?.encryptedHostToken) {
      throw new TableError('no_session', 'Table has no engine session yet');
    }
    return decryptToken(table.encryptedHostToken, this.secretKey);
  }

  engineSessionId(tableId: string): string {
    const table = this.getTable(tableId);
    if (!table?.engineSessionId) {
      throw new TableError('no_session', 'Table has no engine session yet');
    }
    return table.engineSessionId;
  }
}
