import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

/**
 * The only file in Universe that knows MCP tool names and result parsing.
 * The engine returns JSON inside text blocks (isError+content[0].text on
 * failures); we parse and validate with zod and raise typed errors. One
 * client instance per server process (the engine holds per-connection
 * transports in memory).
 *
 * Wire shapes mirror zekel src/mcp/tools.ts + schemas.ts + nextStep.ts:
 *  - errors: { isError: true, content[0].text = JSON { error_code, message, details? } }
 *  - details on recoverable move errors carries { next_step, your_legal_moves,
 *    rules_briefing, hint } under `recovery` (failMove) or `details`.
 *  - next_step is an OBJECT: { status: 'game_over'|'ai_to_move'|'human_to_move',
 *    active_player_id: string|null, instruction: string }.
 *  - get_state returns the player view SPREAD at top level plus
 *    { log, scoreboard, next_step, move_menu?, rules_briefing? }.
 * move_menu is a structured MoveMenu (entries with keys/labels/move_ids).
 */

/** The engine's error payload fields (zekel src/core/errors.ts GameError.toJSON). */
export interface EngineErrorDetails {
  next_step?: NextStep;
  your_legal_moves?: LegalMove[];
  rules_briefing?: RulesBriefing;
  hint?: string;
  recovery?: {
    next_step?: NextStep;
    your_legal_moves?: LegalMove[];
    hint?: string;
  };
  [key: string]: unknown;
}

/**
 * The engine's own recoverable move codes (zekel src/mcp/tools.ts
 * RECOVERABLE_MOVE_ERRORS). A rejection with one of these is a rule the
 * player ran into and is shown as such; every other failure is a fault.
 */
export const RULE_REJECTION_CODES = new Set([
  'ILLEGAL_MOVE',
  'NOT_YOUR_TURN',
  'AMBIGUOUS_MOVE',
  'INVALID_MOVE_SHAPE',
  'GAME_OVER',
]);

export class EngineError extends Error {
  constructor(
    public errorCode: string,
    message: string,
    public details?: EngineErrorDetails,
  ) {
    super(message);
    this.name = 'EngineError';
  }

  /** True when this is a rule the player ran into, not a fault. */
  get isRuleRejection(): boolean {
    return RULE_REJECTION_CODES.has(this.errorCode);
  }

  /** True when the engine could not be reached or answered outside its contract. */
  get isTransportFault(): boolean {
    return this.errorCode.startsWith('engine_');
  }

  /** The engine's error code (ILLEGAL_MOVE, NOT_YOUR_TURN, ...). */
  get code(): string {
    return this.errorCode;
  }

  /** Short rejection reason for display (`message` from the engine). */
  get reason(): string {
    return this.message;
  }

  /** The teaching lesson the engine attached to the rejection, if any. */
  get lesson(): string | undefined {
    return briefingText(this.details?.rules_briefing);
  }

  /** The legal moves the engine returned with a recoverable rejection. */
  get yourLegalMoves(): LegalMove[] | undefined {
    return this.details?.your_legal_moves ?? this.details?.recovery?.your_legal_moves;
  }

  /** The next_step the engine returned with a recoverable rejection. */
  get nextStep(): NextStep | undefined {
    return this.details?.next_step ?? this.details?.recovery?.next_step;
  }
}

export interface RulesBriefingSection {
  id: string;
  title: string;
  text: string;
}

export interface RulesBriefing {
  for_player?: string;
  sections?: RulesBriefingSection[];
  teach_note?: string;
}

function briefingText(b: RulesBriefing | undefined): string | undefined {
  if (!b || !Array.isArray(b.sections)) return undefined;
  const text = b.sections.map((s) => s.text).filter(Boolean).join('\n\n');
  return text || undefined;
}

// ---- schemas ---------------------------------------------------------------

const jsonRecord = z.record(z.unknown());

/** zekel core/game.ts NextStep — an OBJECT, never a string. */
export const nextStepSchema = z.object({
  status: z.enum(['game_over', 'ai_to_move', 'human_to_move']),
  active_player_id: z.string().nullable(),
  instruction: z.string(),
}).passthrough();

/** zekel core/game.ts LegalMove<Move>. */
export const legalMoveSchema = z.object({
  move_id: z.string().optional(),
  description: z.string().optional(),
  move: jsonRecord,
}).passthrough();

/** zekel core/game.ts MoveMenu / MoveMenuEntry — the numbered menu is a
 *  STRUCTURED object (nested categories, leaves carry move_id), not a string. */
export const moveMenuEntrySchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    key: z.string(),
    label: z.string(),
    move_id: z.string().optional(),
    count: z.number().optional(),
    group_by: z.string().optional(),
    submenu: z.array(moveMenuEntrySchema).optional(),
  }).passthrough(),
);

export const moveMenuSchema = z.object({
  prompt: z.string(),
  entries: z.array(moveMenuEntrySchema),
  total_moves: z.number().optional(),
  collapsed: z.boolean().optional(),
  free_text_hint: z.string().optional(),
  how_to_use: z.string().optional(),
}).passthrough();

const rulesBriefingSchema = z.object({
  for_player: z.string().optional(),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
  }).passthrough()).optional(),
  teach_note: z.string().optional(),
}).passthrough();

/** zekel core/game.ts toGameMetadata. */
export const gameMetadataSchema = z.object({
  game_id: z.string(),
  name: z.string(),
  description: z.string(),
  min_players: z.number(),
  max_players: z.number(),
  supports_ai: z.boolean(),
  has_hidden_information: z.boolean(),
  options_schema: jsonRecord,
}).passthrough();

export const listGamesSchema = z.object({
  games: z.array(gameMetadataSchema),
}).passthrough();

export const getRulesSchema = z.object({
  game_id: z.string(),
  rules: z.string(),
  rules_sections: z.array(z.object({ id: z.string(), title: z.string() }).passthrough()).optional(),
  reference_data: z.unknown().optional(),
  move_schema: z.unknown().optional(),
  balance_axes: z.array(z.unknown()).optional(),
}).passthrough();

const playerRecordedSchema = z.object({
  player_id: z.string(),
  kind: z.string(),
  table: z.string().optional(),
  name: z.string().optional(),
  difficulty: z.string().optional(),
  strategy: z.string().optional(),
}).passthrough();

const joinInfoSchema = z.object({
  join_code: z.string(),
  host_player_id: z.string(),
  host_token: z.string(),
  open_seats: z.array(z.string()),
  instructions: z.string().optional(),
}).passthrough();

export const createSessionSchema = z.object({
  session_id: z.string(),
  game_id: z.string().optional(),
  active_player_id: z.string().optional(),
  players_recorded: z.array(playerRecordedSchema).optional(),
  initial_state_uri: z.string().optional(),
  next_step: nextStepSchema.optional(),
  setup_checklist: z.array(z.unknown()).optional(),
  naming_reminder: z.string().optional(),
  difficulty_reminder: z.string().optional(),
  all_ai_reminder: z.string().optional(),
  rules_briefing: rulesBriefingSchema.optional(),
  /** Present when the session has ≥2 human seats (multi-device). Carries
   *  join_code, host_player_id, host_token, open_seats. */
  join: joinInfoSchema.optional(),
  agent_guidance: z.string().optional(),
  session_start_guidance: z.string().optional(),
  guidance: z.string().optional(),
}).passthrough();

export const queryChoiceResultSchema = z.object({
  session_id: z.string().optional(),
  player_id: z.string().optional(),
  name: z.string().optional(),
  answer: z.unknown(),
}).passthrough();
export type QueryChoiceResult = z.infer<typeof queryChoiceResultSchema>;

export const legalMovesResultSchema = z.object({
  session_id: z.string().optional(),
  player_id: z.string().optional(),
  is_their_turn: z.boolean().optional(),
  legal_moves: z.array(legalMoveSchema),
  must_move: z.boolean().optional(),
  move_menu: moveMenuSchema.optional(),
  unavailable_moves: z.array(z.unknown()).optional(),
  unavailable_note: z.string().optional(),
  rules_briefing: rulesBriefingSchema.optional(),
  next_step: nextStepSchema.optional(),
  how_to_apply: z.string().optional(),
}).passthrough();

export const appliedMoveSchema = z.object({
  session_id: z.string().optional(),
  applied: z.literal(true),
  state_summary: z.string(),
  report_to_human: z.string().optional(),
  next_active_player_id: z.string().optional(),
  next_step: nextStepSchema.optional(),
  move_menu: moveMenuSchema.optional(),
  game_over: z.boolean().optional(),
  result: z.unknown().optional(),
  rules_briefing: rulesBriefingSchema.optional(),
}).passthrough();

/** One played move inside a run_ai_turn / get_ai_move result. */
export const aiTurnStepSchema = z.object({
  player_id: z.string(),
  move_taken: z.unknown().optional(),
  narration: z.string().optional(),
  state_summary: z.string(),
  /** One view per digital human seat, keyed by PLAYER_ID. */
  player_views: z.record(z.unknown()).optional(),
}).passthrough();

export const aiTurnResultSchema = z.object({
  session_id: z.string().optional(),
  moves_played: z.number().optional(),
  moves: z.array(aiTurnStepSchema),
  report_to_human: z.string().optional(),
  next_active_player_id: z.string().optional(),
  next_step: nextStepSchema.optional(),
  move_menu: moveMenuSchema.optional(),
  game_over: z.boolean().optional(),
  result: z.unknown().optional(),
  rules_briefing: rulesBriefingSchema.optional(),
  warning: z.string().optional(),
}).passthrough();

/** get_ai_move (single step) result. */
export const aiMoveResultSchema = z.object({
  session_id: z.string().optional(),
  player_id: z.string().optional(),
  move_taken: z.unknown().optional(),
  narration: z.string().optional(),
  state_summary: z.string(),
  report_to_human: z.string().optional(),
  next_active_player_id: z.string().optional(),
  next_step: nextStepSchema.optional(),
  game_over: z.boolean().optional(),
  result: z.unknown().optional(),
}).passthrough();

/** get_state: the player view spread at top level plus these envelope fields. */
export const getStateSchema = z.object({
  log: z.array(z.unknown()).optional(),
  scoreboard: z.unknown().optional(),
  next_step: nextStepSchema.optional(),
  move_menu: moveMenuSchema.nullable().optional(),
  rules_briefing: rulesBriefingSchema.optional(),
}).passthrough();

export const gameOverSchema = z.object({
  game_over: z.boolean(),
  winners: z.array(z.string()).optional(),
  scores: z.record(z.number()).optional(),
  summary: z.string().optional(),
}).passthrough();

export const undoResultSchema = z.object({
  session_id: z.string().optional(),
  undone: z.boolean(),
  actions_reverted: z.number().optional(),
  undo_remaining: z.number().optional(),
  restored_active_player_id: z.string().optional(),
  next_step: nextStepSchema.optional(),
  game_over: z.boolean().optional(),
  message: z.string().optional(),
}).passthrough();

export const joinSessionSchema = z.object({
  session_id: z.string(),
  game_id: z.string().optional(),
  player_id: z.string(),
  claim_token: z.string(),
  next_step: nextStepSchema.optional(),
  instructions: z.string().optional(),
}).passthrough();

export const releaseSeatSchema = z.object({
  session_id: z.string(),
  released_player_id: z.string(),
  multi_device: z.boolean().optional(),
  next_step: nextStepSchema.optional(),
  report_to_human: z.string().optional(),
}).passthrough();

export const reassignSeatSchema = z.object({
  session_id: z.string(),
  player_id: z.string(),
  claim_token: z.string(),
  next_step: nextStepSchema.optional(),
  instructions: z.string().optional(),
}).passthrough();

export const setPreferencesSchema = z.object({
  session_id: z.string().optional(),
  player_id: z.string().optional(),
  preferences: jsonRecord.optional(),
  note: z.string().optional(),
}).passthrough();

export const suggestMoveSchema = z.object({
  session_id: z.string().optional(),
  player_id: z.string().optional(),
  suggested_move: jsonRecord,
  narration: z.string().optional(),
}).passthrough();

export type NextStep = z.infer<typeof nextStepSchema>;
export type LegalMove = z.infer<typeof legalMoveSchema>;
export type GameMetadata = z.infer<typeof gameMetadataSchema>;
export type ListGamesResult = z.infer<typeof listGamesSchema>;
export type GetRulesResult = z.infer<typeof getRulesSchema>;
export type CreateSessionResult = z.infer<typeof createSessionSchema>;
export type LegalMovesResult = z.infer<typeof legalMovesResultSchema>;
export type AppliedMove = z.infer<typeof appliedMoveSchema>;
export type AiTurnStep = z.infer<typeof aiTurnStepSchema>;
export type AiTurnResult = z.infer<typeof aiTurnResultSchema>;
export type AiMoveResult = z.infer<typeof aiMoveResultSchema>;
export type GetStateResult = z.infer<typeof getStateSchema> & Record<string, unknown>;
export type GameOverResult = z.infer<typeof gameOverSchema>;
export type UndoResult = z.infer<typeof undoResultSchema>;
export type JoinSessionResult = z.infer<typeof joinSessionSchema>;
export type ReleaseSeatResult = z.infer<typeof releaseSeatSchema>;
export type ReassignSeatResult = z.infer<typeof reassignSeatSchema>;
export type SetPreferencesResult = z.infer<typeof setPreferencesSchema>;
export type SuggestMoveResult = z.infer<typeof suggestMoveSchema>;

/** Back-compat alias: the session info TableService consumes. */
export type SessionInfo = CreateSessionResult;
/** Player config Universe passes to create_session. */
export interface SeatConfig {
  kind: 'human' | 'ai';
  /** Engine player id; assigned by SeatConfig order (p1, p2, …) when omitted. */
  playerId?: string;
  name?: string;
  difficulty?: string;
  strategy?: string;
  table?: 'physical' | 'digital';
  teaching?: boolean;
}

/** How a move is named to apply_move: the full object, or a move_id from a
 *  fresh get_legal_moves. Explicit so a game move that happens to carry a
 *  `moveId` key can never be mistaken for the id form. */
export type MoveArg = { move: Record<string, unknown> } | { moveId: string };

export type NextStepLike = NextStep | null | undefined;

export function nextStepIsAi(nextStep: NextStepLike): boolean {
  return nextStep?.status === 'ai_to_move';
}

// ---- transport plumbing ------------------------------------------------------

interface RawToolResult {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
}

function extractJson(result: RawToolResult): unknown {
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new EngineError('engine_empty_result', 'Engine returned no content');
  }
  const first = content[0];
  if (first?.type !== 'text' || typeof first.text !== 'string') {
    throw new EngineError('engine_bad_content', 'Engine content is not a text block');
  }
  try {
    return JSON.parse(first.text);
  } catch {
    throw new EngineError('engine_bad_json', 'Engine text block is not JSON');
  }
}

function raiseIfError(raw: RawToolResult, parsed: unknown): void {
  if (raw.isError !== true) return;
  const p = (parsed ?? {}) as Record<string, unknown>;
  const code = typeof p['error_code'] === 'string' ? p['error_code'] : 'ENGINE_ERROR';
  const message = typeof p['message'] === 'string' ? p['message'] : JSON.stringify(parsed);
  // The engine puts `recovery` (next_step, hint, your_legal_moves) beside
  // `details`, not inside it (zekel failMove). Fold it in so callers have
  // one place to look.
  const details = (p['details'] ?? {}) as EngineErrorDetails;
  const recovery = p['recovery'] as EngineErrorDetails['recovery'] | undefined;
  throw new EngineError(code, message, recovery ? { ...details, recovery } : details);
}

export interface EngineClientOptions {
  url: string; // e.g. http://localhost:8080/mcp
  bearerToken: string;
}

export class EngineClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private opts: EngineClientOptions) {}

  /**
   * Connect on first use. A failed attempt is NOT cached: the next call tries
   * again with a fresh transport, so an engine hiccup at boot does not
   * disable the client until a restart.
   */
  private ensureConnected(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;
    const client = new Client({ name: 'zekel-universe', version: '0.0.1' });
    const transport = new StreamableHTTPClientTransport(new URL(this.opts.url), {
      requestInit: {
        headers: { authorization: `Bearer ${this.opts.bearerToken}` },
      },
    });
    this.connecting = client
      .connect(transport)
      .then(() => {
        this.client = client;
        this.connecting = null;
        transport.onclose = () => {
          if (this.client === client) this.client = null;
        };
        return client;
      })
      .catch((err: unknown) => {
        this.connecting = null;
        throw new EngineError(
          'engine_unreachable',
          `Could not connect to the engine at ${this.opts.url}: ${(err as Error).message}`,
        );
      });
    return this.connecting;
  }

  private async call<T>(tool: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const client = await this.ensureConnected();
    let raw: RawToolResult;
    try {
      raw = (await client.callTool({ name: tool, arguments: args })) as RawToolResult;
    } catch (err) {
      // A transport failure mid-call: drop the connection so the next call
      // reconnects, and report it as a fault, never as a rule.
      if (this.client === client) this.client = null;
      throw new EngineError('engine_call_failed', `Engine call ${tool} failed: ${(err as Error).message}`);
    }
    const parsed = extractJson(raw);
    raiseIfError(raw, parsed);
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new EngineError(
        'engine_contract_violation',
        `Tool ${tool} returned an unexpected shape: ${validated.error.message}`,
      );
    }
    return validated.data;
  }

  /**
   * The engine's public view of a session: the resource
   * game://{game_id}/sessions/{session_id}, hidden information omitted by
   * the engine itself. What a spectator sees.
   */
  async getPublicView(gameId: string, sessionId: string): Promise<unknown> {
    const client = await this.ensureConnected();
    const uri = `game://${encodeURIComponent(gameId)}/sessions/${encodeURIComponent(sessionId)}`;
    let result: { contents: Array<{ text?: string; mimeType?: string }> };
    try {
      result = (await client.readResource({ uri })) as typeof result;
    } catch (err) {
      if (this.client === client) this.client = null;
      throw new EngineError('engine_call_failed', `Engine resource ${uri} failed: ${(err as Error).message}`);
    }
    const text = result.contents.find((c) => typeof c.text === 'string')?.text;
    if (text === undefined) throw new EngineError('engine_contract_violation', `Resource ${uri} returned no text`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new EngineError('engine_contract_violation', `Resource ${uri} returned invalid JSON`);
    }
  }

  // ---- the 16 engine tools ---------------------------------------------------

  listGames(): Promise<ListGamesResult> {
    return this.call('list_games', {}, listGamesSchema);
  }

  getRules(gameId: string, topic?: string): Promise<GetRulesResult> {
    return this.call('get_rules', { game_id: gameId, ...(topic !== undefined ? { topic } : {}) }, getRulesSchema);
  }

  createSession(args: {
    gameId: string;
    seats: SeatConfig[];
    options?: Record<string, unknown>;
    hostPlayerId?: string;
  }): Promise<CreateSessionResult> {
    // Engine arg shapes (zekel src/mcp/schemas.ts playerConfigSchema):
    // player_id is required per seat. Universe assigns p1…pN by seat position
    // when the caller doesn't pick ids; engine player ids are these strings.
    const players = args.seats.map((seat, i) => ({
      player_id: seat.playerId ?? `p${i + 1}`,
      kind: seat.kind,
      ...(seat.name !== undefined ? { name: seat.name } : {}),
      ...(seat.kind === 'ai' && seat.difficulty !== undefined ? { difficulty: seat.difficulty } : {}),
      ...(seat.kind === 'ai' && seat.strategy !== undefined ? { strategy: seat.strategy } : {}),
      ...(seat.kind === 'human' && seat.table !== undefined ? { table: seat.table } : {}),
      ...(seat.kind === 'human' && seat.teaching !== undefined ? { teaching: seat.teaching } : {}),
    }));
    return this.call('create_session', {
      game_id: args.gameId,
      players,
      ...(args.options !== undefined ? { options: args.options } : {}),
      ...(args.hostPlayerId !== undefined ? { host_player_id: args.hostPlayerId } : {}),
    }, createSessionSchema);
  }

  getState(sessionId: string, playerId: string, token?: string): Promise<GetStateResult> {
    return this.call('get_state', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, getStateSchema) as Promise<GetStateResult>;
  }

  getLegalMoves(sessionId: string, playerId: string, token?: string): Promise<LegalMovesResult> {
    return this.call('get_legal_moves', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, legalMovesResultSchema);
  }

  /** A read-only question about a decision the seat is composing (query_choice). */
  queryChoice(sessionId: string, playerId: string, token: string | undefined, name: string, args: Record<string, unknown>): Promise<QueryChoiceResult> {
    return this.call('query_choice', {
      session_id: sessionId,
      player_id: playerId,
      name,
      args,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, queryChoiceResultSchema);
  }

  /** Apply by full move object OR by move_id from a fresh get_legal_moves. */
  applyMove(
    sessionId: string,
    playerId: string,
    token: string | undefined,
    arg: MoveArg,
  ): Promise<AppliedMove> {
    const moveArg = 'moveId' in arg ? { move_id: arg.moveId } : { move: arg.move };
    return this.call('apply_move', {
      session_id: sessionId,
      player_id: playerId,
      ...moveArg,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, appliedMoveSchema);
  }

  runAiTurn(sessionId: string, playerId: string, token?: string): Promise<AiTurnResult> {
    return this.call('run_ai_turn', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, aiTurnResultSchema);
  }

  getAiMove(sessionId: string, playerId: string, token?: string): Promise<AiMoveResult> {
    return this.call('get_ai_move', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, aiMoveResultSchema);
  }

  suggestMove(sessionId: string, playerId: string, token?: string): Promise<SuggestMoveResult> {
    return this.call('suggest_move', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, suggestMoveSchema);
  }

  autoReport(sessionId: string, playerId: string, token?: string): Promise<Record<string, unknown>> {
    return this.call('auto_report', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, z.object({ report_move: jsonRecord }).passthrough());
  }

  undo(sessionId: string, token?: string): Promise<UndoResult> {
    return this.call('undo', {
      session_id: sessionId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, undoResultSchema);
  }

  isGameOver(sessionId: string): Promise<GameOverResult> {
    return this.call('is_game_over', { session_id: sessionId }, gameOverSchema);
  }

  joinSession(joinCode: string, name?: string): Promise<JoinSessionResult> {
    return this.call('join_session', {
      join_code: joinCode,
      ...(name !== undefined ? { name } : {}),
    }, joinSessionSchema);
  }

  releaseSeat(sessionId: string, playerId: string, token?: string): Promise<ReleaseSeatResult> {
    return this.call('release_seat', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, releaseSeatSchema);
  }

  reassignSeat(sessionId: string, playerId: string, token?: string): Promise<ReassignSeatResult> {
    return this.call('reassign_seat', {
      session_id: sessionId,
      player_id: playerId,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, reassignSeatSchema);
  }

  setSessionPreferences(
    sessionId: string,
    playerId: string,
    preferences: { teaching?: boolean },
    token?: string,
  ): Promise<SetPreferencesResult> {
    return this.call('set_session_preferences', {
      session_id: sessionId,
      player_id: playerId,
      preferences,
      ...(token !== undefined ? { auth_token: token } : {}),
    }, setPreferencesSchema);
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client) await client.close();
  }
}
