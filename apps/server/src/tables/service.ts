// Table lifecycle: create (vs AI or with friends), join, ready, start.
// Vs-AI tables create the engine session immediately and start playing;
// friends tables sit in the lobby until the start conditions below fire.
//
// The rules the brief decides live here and nowhere else:
//   - a guest may join a friend's table but may not host one;
//   - a table against only AI is always live;
//   - by turns needs at least one friend seat;
//   - the game's own setup options are passed to the engine untouched.

import type { Kysely } from 'kysely';
import type { DB, SeatsTable, TablesTable } from '../db/schema.js';
import { parseJson } from '../db/index.js';
import { newId, now, type Principal } from '../identity.js';
import { encryptToken, decryptToken } from '../crypto.js';
import type { EngineService } from '../engine.js';
import type { GameOverResult, SeatSpec, TableMode, TableStatus } from '@universe/shared';

export class TableError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TableError';
  }
}

export interface CreateTableArgs {
  gameId: string;
  mode: TableMode;
  /** Every seat at the table. The caller's seat is marked by hostPosition. */
  seatSpecs: SeatSpec[];
  hostPosition: number;
  options?: Record<string, unknown>;
}

export interface TableRecord {
  id: string;
  gameId: string;
  hostUserId: string | null;
  hostGuestId: string | null;
  mode: TableMode;
  status: TableStatus;
  engineSessionId: string | null;
  encryptedHostToken: string | null;
  options: Record<string, unknown>;
  nextActorPosition: number | null;
  result: GameOverResult | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface SeatRecord {
  id: string;
  tableId: string;
  position: number;
  kind: 'human' | 'ai';
  userId: string | null;
  guestId: string | null;
  aiDifficulty: string | null;
  enginePlayerId: string | null;
  ready: boolean;
}

function tableFromRow(r: TablesTable): TableRecord {
  return {
    id: r.id,
    gameId: r.game_id,
    hostUserId: r.host_user_id,
    hostGuestId: r.host_guest_id,
    mode: r.mode as TableMode,
    status: r.status as TableStatus,
    engineSessionId: r.engine_session_id,
    encryptedHostToken: r.encrypted_host_token,
    options: parseJson<Record<string, unknown>>(r.options, {}),
    nextActorPosition: r.next_actor_position,
    result: parseJson<GameOverResult | null>(r.result, null),
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

function seatFromRow(r: SeatsTable): SeatRecord {
  return {
    id: r.id,
    tableId: r.table_id,
    position: r.position,
    kind: r.kind as 'human' | 'ai',
    userId: r.user_id,
    guestId: r.guest_id,
    aiDifficulty: r.ai_difficulty,
    enginePlayerId: r.engine_player_id,
    ready: r.ready === 1,
  };
}

export function isHostOf(table: TableRecord, principal: Principal): boolean {
  return principal.kind === 'user'
    ? table.hostUserId !== null && table.hostUserId === principal.userId
    : table.hostGuestId !== null && table.hostGuestId === principal.guestId;
}

export function seatOwnedBy(seat: SeatRecord, principal: Principal): boolean {
  if (seat.kind !== 'human') return false;
  return principal.kind === 'user'
    ? seat.userId !== null && seat.userId === principal.userId
    : seat.guestId !== null && seat.guestId === principal.guestId;
}

export class TableService {
  private startedListeners: Array<(tableId: string) => Promise<void>> = [];

  constructor(
    private db: Kysely<DB>,
    private engine: EngineService,
    private secretKey: string,
  ) {}

  /** Realtime registers here so the opening state (and any opening AI turn)
   *  is written as events as soon as a session exists. Awaited: a table is
   *  not "playing" until its first event exists. */
  onStarted(listener: (tableId: string) => Promise<void>): void {
    this.startedListeners.push(listener);
  }

  async getTable(tableId: string): Promise<TableRecord | null> {
    const row = await this.db.selectFrom('tables').selectAll().where('id', '=', tableId).executeTakeFirst();
    return row ? tableFromRow(row) : null;
  }

  async getSeats(tableId: string): Promise<SeatRecord[]> {
    const rows = await this.db.selectFrom('seats').selectAll()
      .where('table_id', '=', tableId)
      .orderBy('position', 'asc')
      .execute();
    return rows.map(seatFromRow);
  }

  /**
   * Create a table. Against AI only: the engine session is created now with
   * every human seat digital, and the table starts playing. With any friend
   * seat (a human seat that is not the host): the table enters the lobby.
   */
  async createTable(principal: Principal, args: CreateTableArgs): Promise<{ tableId: string; status: TableStatus }> {
    const game = await this.db.selectFrom('games').selectAll()
      .where('engine_game_id', '=', args.gameId).executeTakeFirst();
    if (!game) throw new TableError('unknown_game', `No game ${args.gameId}`);
    if (args.mode !== 'live' && args.mode !== 'turns') {
      throw new TableError('bad_mode', 'Mode must be live or turns');
    }
    const specs = args.seatSpecs;
    if (specs.length === 0) throw new TableError('no_seats', 'A table needs seats');
    if (specs.length < game.min_players || specs.length > game.max_players) {
      throw new TableError('bad_seat_count', `${game.name} seats ${game.min_players} to ${game.max_players} players`);
    }
    for (const s of specs) {
      if (s.kind !== 'human' && s.kind !== 'ai') throw new TableError('bad_seat', 'Seat kind must be human or ai');
      if (s.kind === 'ai' && game.supports_ai !== 1) throw new TableError('no_ai', `${game.name} has no AI opponent`);
    }
    if (!Number.isInteger(args.hostPosition) || args.hostPosition < 0 || args.hostPosition >= specs.length) {
      throw new TableError('bad_host_position', 'Host position is not a seat');
    }
    if (specs[args.hostPosition]!.kind !== 'human') {
      throw new TableError('bad_host_position', 'The host seat must be human');
    }
    const friendTable = specs.some((s, i) => s.kind === 'human' && i !== args.hostPosition);
    if (friendTable && principal.kind === 'guest') {
      throw new TableError('guest_cannot_host', 'Sign in to open a table with friends');
    }
    if (!friendTable && args.mode !== 'live') {
      throw new TableError('ai_only_is_live', 'A table against only AI is always live');
    }
    if (args.mode === 'turns' && !friendTable) {
      throw new TableError('turns_needs_friends', 'By turns needs at least one friend seat');
    }

    const tableId = newId();
    await this.db.insertInto('tables').values({
      id: tableId,
      game_id: args.gameId,
      host_user_id: principal.kind === 'user' ? principal.userId : null,
      host_guest_id: principal.kind === 'guest' ? principal.guestId : null,
      mode: args.mode,
      status: 'lobby',
      engine_session_id: null,
      encrypted_host_token: null,
      options: JSON.stringify(args.options ?? {}),
      next_actor_position: null,
      result: null,
      created_at: now(),
      finished_at: null,
    }).execute();

    for (let position = 0; position < specs.length; position++) {
      const spec = specs[position]!;
      const isHost = position === args.hostPosition;
      await this.db.insertInto('seats').values({
        id: newId(),
        table_id: tableId,
        position,
        kind: spec.kind,
        user_id: isHost && principal.kind === 'user' ? principal.userId : null,
        guest_id: isHost && principal.kind === 'guest' ? principal.guestId : null,
        ai_difficulty: spec.kind === 'ai' ? (spec.aiDifficulty ?? null) : null,
        engine_player_id: null,
        ready: isHost ? 1 : 0,
      }).execute();
    }

    if (!friendTable) {
      await this.startEngineSession(tableId);
      return { tableId, status: 'playing' };
    }
    return { tableId, status: 'lobby' };
  }

  /**
   * Create the engine session with every human seat digital, store the
   * tokens, flip the table to playing, and let realtime write the opening
   * events. Guarded so two callers cannot start the same table twice.
   */
  private async startEngineSession(tableId: string): Promise<void> {
    const claimed = await this.db.updateTable('tables')
      .set({ status: 'starting' })
      .where('id', '=', tableId)
      .where('status', '=', 'lobby')
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) === 0) {
      throw new TableError('already_started', 'Table already started');
    }
    try {
      const table = (await this.getTable(tableId))!;
      const tableSeats = await this.getSeats(tableId);
      const hostPosition = tableSeats.find((s) =>
        table.hostUserId ? s.userId === table.hostUserId : s.guestId === table.hostGuestId)?.position ?? 0;
      const session = await this.engine.createSession({
        gameId: table.gameId,
        seats: tableSeats.map((s) => ({
          playerId: `p${s.position + 1}`,
          kind: s.kind,
          table: s.kind === 'human' ? ('digital' as const) : undefined,
          difficulty: s.kind === 'ai' ? (s.aiDifficulty ?? undefined) : undefined,
        })),
        options: table.options,
        hostPlayerId: `p${hostPosition + 1}`,
      });
      for (const rec of session.players_recorded ?? []) {
        const m = /^p(\d+)$/.exec(rec.player_id);
        if (!m) continue;
        const seat = tableSeats.find((s) => s.position === Number(m[1]) - 1);
        if (seat) {
          await this.db.updateTable('seats').set({ engine_player_id: rec.player_id })
            .where('id', '=', seat.id).execute();
        }
      }
      // Multi-device join tokens live under session.join and only exist with
      // two or more human seats. Solo-vs-AI gets none; Universe acts unauthenticated there.
      const hostToken = session.join?.host_token ?? null;
      await this.db.updateTable('tables').set({
        engine_session_id: session.session_id,
        encrypted_host_token: hostToken ? encryptToken(hostToken, this.secretKey) : null,
        status: 'playing',
      }).where('id', '=', tableId).execute();
      // The opening events are part of starting: a table whose opening
      // state could not be written goes back to the lobby to be started
      // again (a fresh engine session is created then).
      for (const l of this.startedListeners) await l(tableId);
    } catch (err) {
      await this.db.updateTable('tables').set({ status: 'lobby', engine_session_id: null, encrypted_host_token: null })
        .where('id', '=', tableId).execute();
      throw err;
    }
  }

  /** The engine's player id for a seat position at this table. */
  async playerIdFor(tableId: string, position: number): Promise<string> {
    const seat = (await this.getSeats(tableId)).find((s) => s.position === position);
    return seat?.enginePlayerId ?? `p${position + 1}`;
  }

  /** Take the first open (or own) human lobby seat. Guests join by link. */
  async joinTable(principal: Principal, tableId: string): Promise<{ seatPosition: number }> {
    const table = await this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    const tableSeats = await this.getSeats(tableId);
    const already = tableSeats.find((s) => seatOwnedBy(s, principal));
    if (already) return { seatPosition: already.position };
    if (table.status !== 'lobby') throw new TableError('not_joinable', 'This table has already started');

    const open = tableSeats.find((s) => s.kind === 'human' && !s.userId && !s.guestId);
    if (!open) throw new TableError('table_full', 'No open seats');
    await this.db.updateTable('seats').set({
      user_id: principal.kind === 'user' ? principal.userId : null,
      guest_id: principal.kind === 'guest' ? principal.guestId : null,
    }).where('id', '=', open.id).execute();

    await this.maybeAutoStartTurns(tableId);
    return { seatPosition: open.position };
  }

  async setReady(principal: Principal, tableId: string, ready: boolean): Promise<{ position: number; ready: boolean }> {
    const table = await this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    if (table.status !== 'lobby') throw new TableError('already_started', 'Table already started');
    const mine = (await this.getSeats(tableId)).find((s) => seatOwnedBy(s, principal));
    if (!mine) throw new TableError('not_seated', 'You hold no seat at this table');
    await this.db.updateTable('seats').set({ ready: ready ? 1 : 0 }).where('id', '=', mine.id).execute();
    await this.maybeAutoStartTurns(tableId);
    return { position: mine.position, ready };
  }

  /** Host starts a live table once every human seat is taken and ready. */
  async startTable(principal: Principal, tableId: string): Promise<{ tableId: string; status: TableStatus }> {
    const table = await this.getTable(tableId);
    if (!table) throw new TableError('no_table', `No table ${tableId}`);
    if (!isHostOf(table, principal)) throw new TableError('not_host', 'Only the host can start the table');
    if (table.status !== 'lobby') throw new TableError('already_started', 'Table already started');
    const humanSeats = (await this.getSeats(tableId)).filter((s) => s.kind === 'human');
    if (humanSeats.some((s) => !s.userId && !s.guestId)) {
      throw new TableError('open_seats', 'Every human seat must be taken');
    }
    if (humanSeats.some((s) => !s.ready)) {
      throw new TableError('not_ready', 'Every player must be ready');
    }
    await this.startEngineSession(tableId);
    return { tableId, status: 'playing' };
  }

  /** By-turns tables start themselves once every human seat is taken. */
  private async maybeAutoStartTurns(tableId: string): Promise<void> {
    const table = await this.getTable(tableId);
    if (!table || table.status !== 'lobby' || table.mode !== 'turns') return;
    const humanSeats = (await this.getSeats(tableId)).filter((s) => s.kind === 'human');
    if (humanSeats.length === 0) return;
    if (humanSeats.every((s) => s.userId || s.guestId)) {
      await this.startEngineSession(tableId);
    }
  }

  /** Decrypt the stored engine host token for this table (undefined when the
   *  engine session issues none; solo-vs-AI has no multi-device auth). */
  async hostToken(tableId: string): Promise<string | undefined> {
    const table = await this.getTable(tableId);
    if (!table?.encryptedHostToken) return undefined;
    return decryptToken(table.encryptedHostToken, this.secretKey);
  }

  async engineSessionId(tableId: string): Promise<string> {
    const table = await this.getTable(tableId);
    if (!table?.engineSessionId) {
      throw new TableError('no_session', 'Table has no engine session yet');
    }
    return table.engineSessionId;
  }

  async markFinished(tableId: string, result: GameOverResult): Promise<void> {
    await this.db.updateTable('tables').set({
      status: 'finished',
      finished_at: now(),
      result: JSON.stringify(result),
      next_actor_position: null,
    }).where('id', '=', tableId).execute();
  }

  async setNextActor(tableId: string, position: number | null): Promise<void> {
    await this.db.updateTable('tables').set({ next_actor_position: position })
      .where('id', '=', tableId).execute();
  }
}
