// Realtime and the move flow. Every state change becomes one table_events
// row; fan-out is per seat so payloads never cross connections; every turn
// that passes to a disconnected by-turns seat writes a notification.
//
// A "flow" is one human action and everything the engine does in reply: the
// move, any AI turn that follows (as one event per AI move), and the finish
// when the game ends. Only the last event of a flow carries legal moves, so
// nothing lights up until the playback of the flow has caught up.

import { sql, type Kysely } from 'kysely';
import { EngineError } from '@universe/engine-client';
import type { AiTurnResult, AppliedMove, MoveArg, NextStep, RulesBriefing as EngineBriefing } from '@universe/engine-client';
import type { GameOverResult, RulesBriefing, SeatPayload, TableEventKind } from '@universe/shared';
import type { DB } from './db/schema.js';
import { isUniqueViolation, parseJson } from './db/index.js';
import { newId, now, principalLabel, type Principal } from './identity.js';
import { toWireEvent, type EventRow } from './events.js';
import type { EngineService } from './engine.js';
import type { Mailer } from './email.js';
import { seatOwnedBy, type SeatRecord, type TableService } from './tables/service.js';

/** A move the table refused, with the code the browser branches on. */
export class MoveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly reason?: string,
    public readonly lesson?: string,
    public readonly legalMoves?: Array<{ move_id?: string; description?: string; move: Record<string, unknown> }>,
  ) {
    super(message);
    this.name = 'MoveError';
  }
}

/** The realtime layer subscribes here; sockets are not realtime's business. */
export type EventBroadcast = (tableId: string, event: EventRow) => void;

const ENVELOPE_KEYS = new Set(['log', 'next_step', 'move_menu', 'rules_briefing']);

/** get_state spreads the view at top level with an envelope; keep the view. */
function viewOf(state: Record<string, unknown>): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state)) if (!ENVELOPE_KEYS.has(k)) view[k] = v;
  return view;
}

function briefingOf(b: EngineBriefing | undefined | null): RulesBriefing | null {
  if (!b || !Array.isArray(b.sections) || b.sections.length === 0) return null;
  return { for_player: b.for_player, sections: b.sections, teach_note: b.teach_note };
}

function briefingText(b: RulesBriefing | null): string | undefined {
  if (!b) return undefined;
  const text = b.sections.map((s) => s.text).filter(Boolean).join('\n\n');
  return text || undefined;
}

/** Roll and draw events animate differently; classify from the move and summary. */
function moveKind(move: Record<string, unknown>, summary: string): TableEventKind {
  const type = String(move['type'] ?? move['kind'] ?? move['action'] ?? '');
  if (/roll/i.test(type)) return 'roll';
  if (/draw/i.test(type)) return 'draw';
  if (type === 'resolve_report') {
    if (/\broll/i.test(summary)) return 'roll';
    if (/\bdr[ae]w|\bdeal/i.test(summary)) return 'draw';
    return 'roll';
  }
  return 'move';
}

export class Realtime {
  private broadcast: EventBroadcast = () => {};
  private connectedOwners = new Map<string, Set<string>>(); // tableId -> principal labels
  private tableLocks = new Map<string, Promise<unknown>>();

  /** Run one table's mutation at a time; a second call waits for the first. */
  private serialized<T>(tableId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tableLocks.get(tableId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(work);
    this.tableLocks.set(tableId, run);
    void run.catch(() => undefined).finally(() => {
      if (this.tableLocks.get(tableId) === run) this.tableLocks.delete(tableId);
    });
    return run;
  }

  constructor(
    private db: Kysely<DB>,
    private engine: EngineService,
    private tableService: TableService,
    private mailer: Mailer,
    /** the site's public origin, for the link in a nudge email */
    private opts: { appOrigin: string } = { appOrigin: 'http://localhost:5173' },
  ) {
    tableService.onStarted((tableId) => this.openTable(tableId));
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

  isAnyoneConnected(tableId: string, seat: { userId: string | null; guestId: string | null }): boolean {
    const set = this.connectedOwners.get(tableId);
    if (!set) return false;
    if (seat.userId && set.has(`user:${seat.userId}`)) return true;
    if (seat.guestId && set.has(`guest:${seat.guestId}`)) return true;
    return false;
  }

  // ---- events -----------------------------------------------------------------

  /**
   * Write one event with the next sequence number and push it. The number is
   * assigned inside the insert (MAX+1) and protected by a unique index, so a
   * concurrent writer on Postgres loses the race and retries instead of
   * producing a duplicate.
   */
  async appendEvent(
    tableId: string,
    input: Omit<EventRow, 'seq' | 'createdAt'>,
  ): Promise<EventRow> {
    const id = newId();
    const createdAt = now();
    let seq: number | undefined;
    for (let attempt = 0; attempt < 5 && seq === undefined; attempt++) {
      try {
        const result = await sql<{ seq: number }>`
          INSERT INTO table_events
            (id, table_id, seq, kind, actor_seat_position, summary, engine_move, payloads,
             next_actor_position, game_over, rewind_to_seq, created_at)
          SELECT ${id}, ${tableId}, COALESCE(MAX(seq), 0) + 1, ${input.kind}, ${input.actorSeatPosition},
            ${input.summary}, ${input.engineMove === null ? null : JSON.stringify(input.engineMove)},
            ${JSON.stringify(input.payloads)}, ${input.nextActorPosition},
            ${input.gameOver === null ? null : JSON.stringify(input.gameOver)}, ${input.rewindToSeq}, ${createdAt}
          FROM table_events WHERE table_id = ${tableId}
          RETURNING seq
        `.execute(this.db);
        seq = Number(result.rows[0]?.seq);
      } catch (err) {
        if (!isUniqueViolation(err) || attempt === 4) throw err;
      }
    }
    const event: EventRow = { ...input, seq: seq!, createdAt };
    this.broadcast(tableId, event);
    return event;
  }

  /** Events after a sequence number, for replay on reconnect and REST. */
  async eventsAfter(tableId: string, after: number): Promise<EventRow[]> {
    const rows = await this.db.selectFrom('table_events').selectAll()
      .where('table_id', '=', tableId)
      .where('seq', '>', after)
      .orderBy('seq', 'asc')
      .execute();
    return rows.map((r) => ({
      seq: r.seq,
      kind: r.kind as TableEventKind,
      actorSeatPosition: r.actor_seat_position,
      summary: r.summary,
      engineMove: parseJson<Record<string, unknown> | null>(r.engine_move, null),
      payloads: parseJson<Record<string, SeatPayload>>(r.payloads, {}),
      nextActorPosition: r.next_actor_position,
      gameOver: parseJson<GameOverResult | null>(r.game_over, null),
      rewindToSeq: r.rewind_to_seq,
      createdAt: r.created_at,
    }));
  }

  async latestEvent(tableId: string): Promise<EventRow | null> {
    const all = await this.eventsAfter(tableId, 0);
    return all.length ? all[all.length - 1]! : null;
  }

  // ---- per-seat payloads --------------------------------------------------------

  /**
   * Build every human seat's payload after the engine changed state. Views
   * come from get_state per seat (or from the snapshots an AI move carries).
   * When `nextStep` hands the turn to a human, that seat also gets its legal
   * moves and the numbered menu; everyone else gets an empty menu.
   */
  private async seatPayloads(
    tableId: string,
    nextStep: NextStep | null | undefined,
    snapshots?: Record<string, unknown>,
    briefings?: Record<string, RulesBriefing | null>,
  ): Promise<{ payloads: Record<string, SeatPayload>; nextActorPosition: number | null }> {
    const sessionId = await this.tableService.engineSessionId(tableId);
    const token = await this.tableService.hostToken(tableId);
    const seats = await this.tableService.getSeats(tableId);
    const payloads: Record<string, SeatPayload> = {};
    let nextActorPosition: number | null = null;
    for (const seat of seats) {
      if (seat.kind !== 'human') continue;
      const playerId = seat.enginePlayerId ?? `p${seat.position + 1}`;
      const payload: SeatPayload = { view: null, legalMoves: [], moveMenu: null, briefing: null, yourTurn: false, playerId };
      if (snapshots && snapshots[playerId] !== undefined) {
        payload.view = snapshots[playerId];
      } else {
        const state = await this.engine.getState(sessionId, playerId, token);
        payload.view = viewOf(state as Record<string, unknown>);
        payload.briefing = briefingOf(state.rules_briefing);
      }
      if (briefings?.[playerId]) payload.briefing = briefings[playerId] ?? null;
      const theirTurn = nextStep?.status === 'human_to_move' && nextStep.active_player_id === playerId;
      if (theirTurn) {
        const legal = await this.engine.getLegalMoves(sessionId, playerId, token);
        payload.legalMoves = legal.legal_moves;
        payload.moveMenu = (legal.move_menu as SeatPayload['moveMenu']) ?? null;
        payload.yourTurn = true;
        payload.briefing ??= briefingOf(legal.rules_briefing);
        nextActorPosition = seat.position;
      }
      payloads[String(seat.position)] = payload;
    }
    return { payloads, nextActorPosition };
  }

  /** Engine AI snapshots key views by player id; a plain record is fine. */
  private snapshotsOf(step: { player_views?: Record<string, unknown> }): Record<string, unknown> | undefined {
    const pv = step.player_views;
    if (!pv || typeof pv !== 'object' || Array.isArray(pv)) return undefined;
    return pv;
  }

  // ---- the flows -------------------------------------------------------------------

  /** The table just got its engine session: write the opening state. */
  private async openTable(tableId: string): Promise<void> {
    const sessionId = await this.tableService.engineSessionId(tableId);
    const token = await this.tableService.hostToken(tableId);
    const seats = await this.tableService.getSeats(tableId);
    const firstHuman = seats.find((s) => s.kind === 'human');
    const probe = await this.engine.getState(sessionId, firstHuman?.enginePlayerId ?? 'p1', token);
    const nextStep = probe.next_step ?? null;
    if (nextStep?.status === 'ai_to_move' && nextStep.active_player_id) {
      const { payloads } = await this.seatPayloads(tableId, null);
      await this.appendEvent(tableId, {
        kind: 'setup', actorSeatPosition: null, summary: 'The table is set. An AI opens.',
        engineMove: null, payloads, nextActorPosition: null, gameOver: null, rewindToSeq: null,
      });
      await this.runAiTurns(tableId, nextStep.active_player_id);
      return;
    }
    await this.endFlow(tableId, 'setup', null, 'The table is set.', null, nextStep, undefined, undefined, null);
  }

  /**
   * The full move flow per the plan: ownership and status check, apply the
   * move, one event for it, an AI turn if the engine says so, and a system
   * event when the game ends. Returns the last sequence number written.
   */
  handleMove(
    principal: Principal,
    tableId: string,
    seatPosition: number,
    move: Record<string, unknown>,
  ): Promise<{ lastSeq: number }> {
    return this.serialized(tableId, () => this.applyHumanMove(principal, tableId, seatPosition, move));
  }

  private async applyHumanMove(
    principal: Principal,
    tableId: string,
    seatPosition: number,
    move: Record<string, unknown>,
  ): Promise<{ lastSeq: number }> {
    const table = await this.tableService.getTable(tableId);
    if (!table) throw new MoveError('no_table', `No table ${tableId}`);
    if (table.status !== 'playing') throw new MoveError('not_playing', 'This table is not in play');
    const seats = await this.tableService.getSeats(tableId);
    const seat = seats.find((s) => s.position === seatPosition);
    if (!seat || !seatOwnedBy(seat, principal)) {
      throw new MoveError('not_your_seat', 'You do not own that seat');
    }
    const sessionId = table.engineSessionId!;
    const token = await this.tableService.hostToken(tableId);
    const playerId = seat.enginePlayerId ?? `p${seatPosition + 1}`;

    let applied: AppliedMove;
    try {
      applied = await this.engine.applyMove(sessionId, playerId, token, { move } satisfies MoveArg);
    } catch (err) {
      throw classifyEngineFailure(err);
    }

    const kind = moveKind(move, applied.state_summary);
    const briefing = briefingOf(applied.rules_briefing);
    const briefings = briefing ? { [playerId]: briefing } : undefined;
    const last = await this.continueFlow(tableId, kind, seatPosition, applied.state_summary, move, applied, briefings);
    return { lastSeq: last.seq };
  }

  /**
   * After a human action (or an opening), react to the engine's next_step:
   * an AI turn, a game over, or a human's turn. Writes the event for the
   * action itself first.
   */
  private async continueFlow(
    tableId: string,
    kind: TableEventKind,
    actorSeatPosition: number | null,
    summary: string,
    engineMove: Record<string, unknown> | null,
    applied: AppliedMove,
    briefings?: Record<string, RulesBriefing | null>,
  ): Promise<EventRow> {
    const nextStep = applied.next_step ?? null;
    const result = await this.resultOf(tableId, applied);
    if (result) {
      return this.finishGame(tableId, kind, actorSeatPosition, summary, engineMove, result, briefings);
    }
    if (nextStep?.status === 'ai_to_move' && nextStep.active_player_id) {
      const { payloads } = await this.seatPayloads(tableId, null, undefined, briefings);
      await this.appendEvent(tableId, {
        kind, actorSeatPosition, summary, engineMove, payloads,
        nextActorPosition: null, gameOver: null, rewindToSeq: null,
      });
      return this.runAiTurns(tableId, nextStep.active_player_id);
    }
    return this.endFlow(tableId, kind, actorSeatPosition, summary, engineMove, nextStep, undefined, briefings, null);
  }

  /** Write the last event of a flow: views plus legal moves for whoever is up. */
  private async endFlow(
    tableId: string,
    kind: TableEventKind,
    actorSeatPosition: number | null,
    summary: string,
    engineMove: Record<string, unknown> | null,
    nextStep: NextStep | null,
    snapshots: Record<string, unknown> | undefined,
    briefings: Record<string, RulesBriefing | null> | undefined,
    rewindToSeq: number | null,
  ): Promise<EventRow> {
    const { payloads, nextActorPosition } = await this.seatPayloads(tableId, nextStep, snapshots, briefings);
    const event = await this.appendEvent(tableId, {
      kind, actorSeatPosition, summary, engineMove, payloads, nextActorPosition, gameOver: null, rewindToSeq,
    });
    await this.tableService.setNextActor(tableId, nextActorPosition);
    if (nextActorPosition !== null) await this.notifyTurnIfDisconnected(tableId, nextActorPosition);
    return event;
  }

  /**
   * Run the AI's whole turn (the engine plays every consecutive AI seat in
   * one call) and write one event per move, in order, each with the per-seat
   * snapshots the engine attached. The last move carries legal moves for the
   * human who is up next.
   */
  private async runAiTurns(tableId: string, firstAiPlayerId: string): Promise<EventRow> {
    const sessionId = await this.tableService.engineSessionId(tableId);
    const token = await this.tableService.hostToken(tableId);
    let aiPlayerId: string | null = firstAiPlayerId;
    let last: EventRow | null = null;
    // The engine already chains consecutive AI seats; the loop only guards
    // against an engine that stops early with another AI still up.
    for (let round = 0; round < 8 && aiPlayerId; round++) {
      let ai: AiTurnResult;
      try {
        ai = await this.engine.runAiTurn(sessionId, aiPlayerId, token);
      } catch (err) {
        throw classifyEngineFailure(err);
      }
      const result = await this.resultOf(tableId, ai);
      const nextStep = ai.next_step ?? null;
      const humanBriefing = briefingOf(ai.rules_briefing);
      const briefings = humanBriefing && nextStep?.active_player_id
        ? { [nextStep.active_player_id]: humanBriefing }
        : undefined;
      const moves = ai.moves;
      for (let i = 0; i < moves.length; i++) {
        const step = moves[i]!;
        const isLast = i === moves.length - 1;
        const engineMove = (step.move_taken as Record<string, unknown> | undefined) ?? null;
        const kind: TableEventKind = 'ai_move';
        const snapshots = this.snapshotsOf(step);
        if (!isLast) {
          const { payloads } = await this.seatPayloads(tableId, null, snapshots);
          last = await this.appendEvent(tableId, {
            kind, actorSeatPosition: null, summary: step.state_summary, engineMove, payloads,
            nextActorPosition: null, gameOver: null, rewindToSeq: null,
          });
          continue;
        }
        if (result) {
          last = await this.finishGame(tableId, kind, null, step.state_summary, engineMove, result, briefings, snapshots);
          return last;
        }
        if (nextStep?.status === 'ai_to_move' && nextStep.active_player_id) {
          const { payloads } = await this.seatPayloads(tableId, null, snapshots);
          last = await this.appendEvent(tableId, {
            kind, actorSeatPosition: null, summary: step.state_summary, engineMove, payloads,
            nextActorPosition: null, gameOver: null, rewindToSeq: null,
          });
          aiPlayerId = nextStep.active_player_id;
          break;
        }
        last = await this.endFlow(tableId, kind, null, step.state_summary, engineMove, nextStep, snapshots, briefings, null);
        return last;
      }
      if (moves.length === 0) {
        if (result) return this.finishGame(tableId, 'system', null, 'The game is over.', null, result, briefings);
        if (nextStep?.status === 'ai_to_move' && nextStep.active_player_id && nextStep.active_player_id !== aiPlayerId) {
          aiPlayerId = nextStep.active_player_id;
          continue;
        }
        return this.endFlow(tableId, 'system', null, ai.report_to_human ?? 'The AI passes.', null, nextStep, undefined, briefings, null);
      }
      if (nextStep?.status !== 'ai_to_move') break;
    }
    return last!;
  }

  /** The engine reports game over on the move response; fall back to asking. */
  private async resultOf(tableId: string, r: { game_over?: boolean; result?: unknown }): Promise<GameOverResult | null> {
    if (r.game_over !== true) return null;
    const res = r.result as Partial<GameOverResult> | undefined;
    if (res && Array.isArray(res.winners) && res.scores && typeof res.summary === 'string') {
      return { winners: res.winners, scores: res.scores, summary: res.summary };
    }
    const sessionId = await this.tableService.engineSessionId(tableId);
    const over = await this.engine.isGameOver(sessionId);
    if (!over.game_over) return null;
    return { winners: over.winners ?? [], scores: over.scores ?? {}, summary: over.summary ?? '' };
  }

  /** Mark the table finished and write the final event with the result. */
  private async finishGame(
    tableId: string,
    kind: TableEventKind,
    actorSeatPosition: number | null,
    summary: string,
    engineMove: Record<string, unknown> | null,
    result: GameOverResult,
    briefings?: Record<string, RulesBriefing | null>,
    snapshots?: Record<string, unknown>,
  ): Promise<EventRow> {
    const { payloads } = await this.seatPayloads(tableId, null, snapshots, briefings);
    const event = await this.appendEvent(tableId, {
      kind, actorSeatPosition,
      summary: `${summary} The game is over. ${result.summary}`.trim(),
      engineMove, payloads, nextActorPosition: null, gameOver: result, rewindToSeq: null,
    });
    await this.tableService.markFinished(tableId, result);
    for (const seat of await this.tableService.getSeats(tableId)) {
      if (seat.kind !== 'human') continue;
      await this.db.insertInto('notifications').values({
        id: newId(), user_id: seat.userId, guest_id: seat.guestId,
        kind: 'table_finished', table_id: tableId, read: 0, created_at: now(),
      }).execute();
    }
    return event;
  }

  /**
   * By turns: when a turn passes to a seat whose owner is not connected,
   * write a notification (one unread per owner and table; a second pass to
   * the same absent player adds nothing). The email nudge follows later
   * from `sendDueNudges` if the owner is still away and still up.
   */
  async notifyTurnIfDisconnected(tableId: string, seatPosition: number): Promise<void> {
    const table = await this.tableService.getTable(tableId);
    if (!table || table.mode !== 'turns') return;
    const seat = (await this.tableService.getSeats(tableId)).find((s) => s.position === seatPosition);
    if (!seat || seat.kind !== 'human') return;
    if (this.isAnyoneConnected(tableId, seat)) return;
    const pending = await this.db.selectFrom('notifications').select('id')
      .where('table_id', '=', tableId).where('kind', '=', 'your_turn').where('read', '=', 0)
      .where(seat.userId ? 'user_id' : 'guest_id', '=', seat.userId ?? seat.guestId)
      .executeTakeFirst();
    if (pending) return;
    await this.db.insertInto('notifications').values({
      id: newId(), user_id: seat.userId, guest_id: seat.guestId,
      kind: 'your_turn', table_id: tableId, read: 0, created_at: now(), emailed_at: null,
    }).execute();
  }

  /** Opening the table answers its notifications: mark this owner's read. */
  async markNotificationsRead(tableId: string, p: Principal): Promise<void> {
    await this.db.updateTable('notifications').set({ read: 1 })
      .where('table_id', '=', tableId).where('read', '=', 0)
      .where(p.kind === 'user' ? 'user_id' : 'guest_id', '=', p.kind === 'user' ? p.userId : p.guestId)
      .execute();
  }

  /**
   * The email nudge: every unread your-turn notification older than the
   * delay gets one email, provided the table is still in play, the turn is
   * still that player's, they are still not connected, and they have an
   * address (guests have none). Returns how many were sent. Called on a
   * timer by the app and directly by tests.
   */
  async sendDueNudges(delayMs: number, at: number = Date.now()): Promise<number> {
    const cutoff = new Date(at - delayMs).toISOString();
    const due = await this.db.selectFrom('notifications').selectAll()
      .where('kind', '=', 'your_turn').where('read', '=', 0).where('emailed_at', 'is', null)
      .where('created_at', '<=', cutoff).where('table_id', 'is not', null)
      .orderBy('created_at', 'asc')
      .execute();
    let sent = 0;
    for (const note of due) {
      const tableId = note.table_id!;
      const table = await this.tableService.getTable(tableId);
      if (!table || table.status !== 'playing' || table.nextActorPosition === null) continue;
      const seat = (await this.tableService.getSeats(tableId)).find((s) => s.position === table.nextActorPosition);
      if (!seat || seat.userId !== note.user_id || seat.guestId !== note.guest_id) continue;
      if (this.isAnyoneConnected(tableId, seat)) continue;
      if (!note.user_id) continue;
      const identity = await this.db.selectFrom('identities').select('provider_subject')
        .where('user_id', '=', note.user_id).where('provider', '=', 'email').executeTakeFirst();
      if (!identity) continue;
      const game = await this.db.selectFrom('games').select('name')
        .where('engine_game_id', '=', table.gameId).executeTakeFirst();
      const name = game?.name ?? 'your game';
      // Mark first so a slow mailer cannot send twice from two sweeps.
      await this.db.updateTable('notifications').set({ emailed_at: now() }).where('id', '=', note.id).execute();
      await this.mailer.send({
        to: identity.provider_subject,
        subject: `Your move in ${name}`,
        text: `It is your turn at your ${name} table on zekel universe.\n\n${this.opts.appOrigin}/table/${tableId}\n\nYou get one of these per turn, only while you are away from the table.`,
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * After a restart, a table can be stuck between events: the engine has a
   * next step but the last event hands the turn to nobody. Ask the engine and
   * write what is missing (an AI turn, a human's turn, or the finish). Safe
   * to call on every table open; it does nothing when the events are whole.
   */
  resumeTable(tableId: string): Promise<boolean> {
    return this.serialized(tableId, () => this.resumeIfStuck(tableId));
  }

  private async resumeIfStuck(tableId: string): Promise<boolean> {
    const table = await this.tableService.getTable(tableId);
    if (!table || table.status !== 'playing' || !table.engineSessionId) return false;
    const last = await this.latestEvent(tableId);
    if (!last || last.gameOver) return false;
    const seats = await this.tableService.getSeats(tableId);
    const firstHuman = seats.find((s) => s.kind === 'human');
    const token = await this.tableService.hostToken(tableId);
    const state = await this.engine.getState(table.engineSessionId, firstHuman?.enginePlayerId ?? 'p1', token);
    const nextStep = state.next_step ?? null;
    if (nextStep?.status === 'human_to_move') {
      // Whole when the last event already hands the turn to the player the
      // engine is waiting for.
      const expected = seats.find((s) => s.position === last.nextActorPosition);
      const expectedPlayer = expected ? (expected.enginePlayerId ?? `p${expected.position + 1}`) : null;
      if (expectedPlayer === nextStep.active_player_id) return false;
      await this.endFlow(tableId, 'system', null, 'Play resumes.', null, nextStep, undefined, undefined, null);
      return true;
    }
    if (nextStep?.status === 'game_over') {
      const over = await this.engine.isGameOver(table.engineSessionId);
      if (!over.game_over) return false;
      const result: GameOverResult = { winners: over.winners ?? [], scores: over.scores ?? {}, summary: over.summary ?? '' };
      await this.finishGame(tableId, 'system', null, 'Play resumes.', null, result);
      return true;
    }
    if (nextStep?.status === 'ai_to_move' && nextStep.active_player_id) {
      await this.runAiTurns(tableId, nextStep.active_player_id);
      return true;
    }
    return false;
  }

  /**
   * Undo: only the seat that made the last human move may take it back, and
   * only while nobody else has acted since. The engine reverts that move and
   * the AI moves after it as one unit; the browsers rewind to the restored
   * views.
   */
  handleUndo(principal: Principal, tableId: string): Promise<{ seq: number }> {
    return this.serialized(tableId, () => this.applyUndo(principal, tableId));
  }

  private async applyUndo(principal: Principal, tableId: string): Promise<{ seq: number }> {
    const table = await this.tableService.getTable(tableId);
    if (!table) throw new MoveError('no_table', `No table ${tableId}`);
    if (table.status !== 'playing') throw new MoveError('not_playing', 'This table is not in play');
    const seats = await this.tableService.getSeats(tableId);
    const mine = seats.filter((s) => seatOwnedBy(s, principal));
    if (mine.length === 0) throw new MoveError('not_seated', 'You hold no seat at this table');

    const events = await this.eventsAfter(tableId, 0);
    const lastHuman = [...events].reverse().find((e) => e.actorSeatPosition !== null && e.kind !== 'undo');
    if (!lastHuman) throw new MoveError('nothing_to_undo', 'There is no move to take back');
    const actor = seats.find((s) => s.position === lastHuman.actorSeatPosition);
    if (!actor || !seatOwnedBy(actor, principal)) {
      throw new MoveError('not_your_move', 'Only the player who made the last move can take it back');
    }

    const sessionId = table.engineSessionId!;
    const token = await this.tableService.hostToken(tableId);
    let undone;
    try {
      undone = await this.engine.undo(sessionId, token);
    } catch (err) {
      throw classifyEngineFailure(err);
    }
    if (!undone.undone) {
      throw new MoveError('undo_unavailable', undone.message ?? 'That move cannot be taken back');
    }
    const nextStep = undone.next_step ?? (await this.engine.getState(sessionId, actor.enginePlayerId ?? 'p1', token)).next_step ?? null;
    const summary = `${actorName(actor)} took back their move.`;
    const ev = await this.endFlow(
      tableId, 'undo', actor.position, summary, { action: 'undo' }, nextStep, undefined, undefined, lastHuman.seq - 1,
    );
    return { seq: ev.seq };
  }
}

function actorName(seat: SeatRecord): string {
  return `Seat ${seat.position + 1}`;
}

/**
 * Only the engine's own rule codes are rejections to show the player;
 * everything else is a fault reported as such. A lost connection, a schema
 * mismatch, or an engine bug must never read as a rule the player broke.
 */
export function classifyEngineFailure(err: unknown): MoveError {
  if (err instanceof EngineError) {
    if (err.isRuleRejection) {
      return new MoveError('move_rejected', err.message, err.message, err.lesson, err.yourLegalMoves);
    }
    if (err.isTransportFault) {
      return new MoveError('engine_unavailable', 'The rules engine did not answer. Try again in a moment.');
    }
    return new MoveError('engine_error', `The rules engine reported a problem: ${err.errorCode}`);
  }
  return new MoveError('internal', 'Something went wrong on the server.');
}

export { toWireEvent, briefingText };
