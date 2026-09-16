// Realtime and the move flow. Every state change becomes one table_events
// row, fan-out is per seat so views never cross connections, and every
// turn that passes to a disconnected by-turns seat writes a notification.

import { eq, and, gt, asc, sql } from 'drizzle-orm';
import type { DatabaseClient } from './db/index.js';
import { tables, seats, tableEvents, notifications } from './db/schema.js';
import { newId, now, principalLabel, type Principal } from './identity.js';
import { ownsSeat, toWireEvent, type EventRow } from './events.js';
import type { EngineService } from './engine.js';
import type { EmailSender } from './email.js';
import type { TableService } from './tables/service.js';
import type { TableEventKind } from '@universe/shared';

export class MoveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly reason?: string,
    public readonly lesson?: string,
  ) {
    super(message);
    this.name = 'MoveError';
  }
}

/** The realtime layer subscribes here; sockets are not realtime's business. */
export type EventBroadcast = (tableId: string, event: EventRow, kind: TableEventKind) => void;

/** Engine next_step is an OBJECT: { status, active_player_id, instruction }. */
function isAiNext(nextStep: { status?: string } | null | undefined): boolean {
  return nextStep?.status === 'ai_to_move';
}

function moveKind(move: Record<string, unknown>): TableEventKind {
  const type = String(move.type ?? move.kind ?? move.action ?? '');
  if (/roll/i.test(type)) return 'roll';
  if (/draw/i.test(type)) return 'draw';
  return 'move';
}

export class Realtime {
  private broadcast: EventBroadcast = () => {};
  private connectedOwners = new Map<string, Set<string>>(); // tableId -> principal labels

  constructor(
    private db: DatabaseClient,
    private engine: EngineService,
    private tableService: TableService,
    private email: EmailSender,
  ) {
    tableService.onStarted((tableId) => {
      void this.maybeRunAiOpening(tableId).catch((err) =>
        console.error(`[realtime] opening AI turn failed for ${tableId}:`, err));
    });
  }

  onBroadcast(fn: EventBroadcast): void {
    this.broadcast = fn;
  }

  markConnected(tableId: string, p: Principal): void {
    const set = this.connectedOwners.get(tableId) ?? new Set<string>();
    set.add(principalLabel(p));
    this.connectedOwners.set(tableId, set);
  }

  markDisconnected(tableId: string, p: Principal): void {
    const set = this.connectedOwners.get(tableId);
    if (!set) return;
    set.delete(principalLabel(p));
    if (set.size === 0) this.connectedOwners.delete(tableId);
  }

  private isAnyoneConnected(tableId: string, seat: { userId: string | null; guestId: string | null }): boolean {
    const set = this.connectedOwners.get(tableId);
    if (!set) return false;
    if (seat.userId && set.has(`user:${seat.userId}`)) return true;
    if (seat.guestId && set.has(`guest:${seat.guestId}`)) return true;
    return false;
  }

  /** The next sequence number for a table (MAX(seq)+1; no count ambiguity). */
  private nextSeq(tableId: string): number {
    const row = this.db
      .select({ max: sql<number | null>`max(${tableEvents.seq})` })
      .from(tableEvents)
      .where(eq(tableEvents.tableId, tableId))
      .get();
    return (row?.max ?? 0) + 1;
  }

  /** Write one event, push it stripped per seat, attach result for callers. */
  appendEvent(
    tableId: string,
    kind: TableEventKind,
    actorSeatPosition: number | null,
    summary: string,
    engineMove: Record<string, unknown> | null,
    views: Record<string, unknown>,
  ): EventRow {
    const event: EventRow = {
      seq: this.nextSeq(tableId),
      kind,
      actorSeatPosition,
      summary,
      engineMove,
      views,
    };
    this.db.insert(tableEvents).values({
      id: newId(),
      tableId,
      seq: event.seq,
      kind,
      actorSeatPosition,
      summary,
      engineMove,
      views,
      createdAt: now(),
    }).run();
    this.broadcast(tableId, event, kind);
    return event;
  }

  /** Fetch each digital human seat's view and return keyed by seat position.
   *  Engine player ids are the strings chosen at create_session. */
  private async fetchSeatViews(tableId: string): Promise<Record<string, unknown>> {
    const sessionId = this.tableService.engineSessionId(tableId);
    const token = this.tableService.hostToken(tableId);
    const views: Record<string, unknown> = {};
    for (const seat of this.tableService.getSeats(tableId)) {
      if (seat.kind !== 'human') continue;
      const playerId = this.tableService.playerIdFor(tableId, seat.position);
      views[String(seat.position)] = await this.engine.getState(sessionId, playerId, token);
    }
    return views;
  }

  /** Events after a sequence number, for replay on reconnect and REST. */
  eventsAfter(tableId: string, after: number): EventRow[] {
    const rows = this.db.select().from(tableEvents)
      .where(and(eq(tableEvents.tableId, tableId), gt(tableEvents.seq, after)))
      .orderBy(asc(tableEvents.seq))
      .all();
    return rows.map((r) => ({
      seq: r.seq,
      kind: r.kind,
      actorSeatPosition: r.actorSeatPosition,
      summary: r.summary,
      engineMove: r.engineMove,
      views: r.views,
    }));
  }

  /**
   * The full move flow per the plan: ownership and status check, apply the
   * move, one event for it, an AI turn if the engine says so, and a system
   * event when the game ends.
   */
  async handleMove(
    principal: Principal,
    tableId: string,
    seatPosition: number,
    move: Record<string, unknown>,
  ): Promise<{ lastSeq: number }> {
    const table = this.tableService.getTable(tableId);
    if (!table) throw new MoveError('no_table', `No table ${tableId}`);
    if (table.status !== 'playing') {
      throw new MoveError('not_playing', 'This table is not in play');
    }
    const tableSeats = this.tableService.getSeats(tableId);
    const seat = tableSeats.find((s) => s.position === seatPosition);
    if (!seat || !ownsSeat(seat, principal)) {
      throw new MoveError('not_your_seat', 'You do not own that seat');
    }

    const sessionId = this.tableService.engineSessionId(tableId);
    const token = this.tableService.hostToken(tableId);

    let applied;
    const playerId = this.tableService.playerIdFor(tableId, seatPosition);
    try {
      applied = await this.engine.applyMove(sessionId, playerId, token, move);
    } catch (err) {
      // Engine rejections (EngineError) carry reason + lesson + the legal set;
      // anything else is a genuine failure and goes up as one.
      if (err instanceof Error && 'reason' in err) {
        const e = err as { reason?: string; lesson?: string };
        throw new MoveError('move_rejected', e.reason ?? 'Move rejected', e.reason, e.lesson);
      }
      throw err;
    }

    // apply_move returns NO player_views — fetch each digital seat's view
    // with one get_state call per seat, keyed by engine player id strings.
    const views = await this.fetchSeatViews(tableId);
    const ev = this.appendEvent(tableId, moveKind(move), seatPosition, applied.state_summary, move, views);

    if (applied.next_step?.status === 'ai_to_move') {
      await this.runAiTurnCascade(tableId, applied.next_step.active_player_id!);
    }
    await this.checkGameOver(tableId);
    return { lastSeq: ev.seq };
  }

  /** After a human move, run one AI turn and an event per move, in order.
   *  run_ai_turn requires the AI seat's player_id; next_step says who's up. */
  private async runAiTurnCascade(tableId: string, firstAiPlayerId: string): Promise<void> {
    const sessionId = this.tableService.engineSessionId(tableId);
    const token = this.tableService.hostToken(tableId);
    const result = await this.engine.runAiTurn(sessionId, firstAiPlayerId, token);
    for (const step of result.moves) {
      const views = step.player_views
        ? this.viewsBySeatPosition(step.player_views, tableId)
        : await this.fetchSeatViews(tableId);
      this.appendEvent(
        tableId,
        'ai_move',
        null,
        step.state_summary,
        (step.move_taken as Record<string, unknown> | undefined) ?? null,
        views,
      );
    }
  }

  /** When a table starts with an AI up (its seats open the game), push turn.
   *  get_state (host seat) tells us authoritatively via next_step. */
  private async maybeRunAiOpening(tableId: string): Promise<void> {
    const sessionId = this.tableService.engineSessionId(tableId);
    const token = this.tableService.hostToken(tableId);
    const hostPid = this.hostPlayerId(tableId);
    const state = await this.engine.getState(sessionId, hostPid, token);
    const nextStep = state.next_step;
    if (nextStep?.status !== 'ai_to_move' || !nextStep.active_player_id) return;
    this.appendEvent(tableId, 'system', null, 'The table opens with an AI turn.', null, {});
    await this.runAiTurnCascade(tableId, nextStep.active_player_id);
    await this.checkGameOver(tableId);
  }

  private hostPlayerId(tableId: string): string {
    const table = this.tableService.getTable(tableId);
    const seat = this.tableService.getSeats(tableId).find((s) =>
      table?.hostUserId ? s.userId === table.hostUserId : s.guestId === table?.hostGuestId);
    if (!seat) return 'p1';
    return seat.enginePlayerId ?? `p${seat.position + 1}`;
  }

  /** Engine move responses key views by player id; re-key by seat position. */
  private viewsBySeatPosition(
    playerViews: Record<string, unknown>,
    tableId: string,
  ): Record<string, unknown> {
    const byPosition: Record<string, unknown> = {};
    const tableSeats = this.tableService.getSeats(tableId);
    for (const seat of tableSeats) {
      if (seat.kind !== 'human') continue;
      if (seat.enginePlayerId && playerViews[seat.enginePlayerId] !== undefined) {
        byPosition[String(seat.position)] = playerViews[seat.enginePlayerId];
      }
    }
    // If no engine ids are recorded (older session), pass through keys that
    // already look like seat positions.
    if (Object.keys(byPosition).length === 0) {
      for (const [key, view] of Object.entries(playerViews)) {
        if (/^\d+$/.test(key)) byPosition[key] = view;
      }
    }
    return byPosition;
  }

  private async checkGameOver(tableId: string): Promise<void> {
    const sessionId = this.tableService.engineSessionId(tableId);
    const over = await this.engine.isGameOver(sessionId);
    if (!over.game_over) return;
    this.db.update(tables).set({ status: 'finished', finishedAt: now() })
      .where(eq(tables.id, tableId)).run();
    const summary = `The game is over. ${over.summary ? String(over.summary) : ''}`.trim();
    const views = await this.fetchSeatViews(tableId);
    this.appendEvent(tableId, 'system', null, summary, null, views);
    // Notify everyone seated that the table finished.
    for (const seat of this.tableService.getSeats(tableId)) {
      if (seat.kind !== 'human') continue;
      this.db.insert(notifications).values({
        id: newId(),
        userId: seat.userId,
        guestId: seat.guestId,
        kind: 'table_finished',
        tableId,
        createdAt: now(),
      }).run();
    }
  }

  /**
   * By-turns: when a turn passes to a seat whose owner is not connected,
   * write a notification rows (the email hook is a no-op for now).
   */
  notifyTurnIfDisconnected(tableId: string, seatPosition: number): void {
    const table = this.tableService.getTable(tableId);
    if (!table || table.mode !== 'turns') return;
    const seat = this.tableService.getSeats(tableId).find((s) => s.position === seatPosition);
    if (!seat || seat.kind !== 'human') return;
    if (this.isAnyoneConnected(tableId, seat)) return;
    this.db.insert(notifications).values({
      id: newId(),
      userId: seat.userId,
      guestId: seat.guestId,
      kind: 'your_turn',
      tableId,
      createdAt: now(),
    }).run();
    // The delayed email hook lands later; call shape already in place.
    void this.email; // used once the hook exists
  }

  /** Undo the last engine move and tell every browser to rewind. */
  async handleUndo(principal: Principal, tableId: string): Promise<{ seq: number }> {
    const table = this.tableService.getTable(tableId);
    if (!table) throw new MoveError('no_table', `No table ${tableId}`);
    if (table.status !== 'playing') throw new MoveError('not_playing', 'This table is not in play');
    const tableSeats = this.tableService.getSeats(tableId);
    if (!tableSeats.some((s) => ownsSeat(s, principal))) {
      throw new MoveError('not_seated', 'You hold no seat at this table');
    }
    const sessionId = this.tableService.engineSessionId(tableId);
    const token = this.tableService.hostToken(tableId);
    await this.engine.undo(sessionId, token);
    const views = await this.fetchSeatViews(tableId);
    const ev = this.appendEvent(
      tableId, 'system', null, 'Move undone — rewinding.', { action: 'undo' }, views,
    );
    return { seq: ev.seq };
  }
}

export { toWireEvent };
