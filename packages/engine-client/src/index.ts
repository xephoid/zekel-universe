import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

/**
 * The only file in Universe that knows MCP tool names and result parsing.
 * The engine returns JSON inside text blocks; we parse and validate with zod
 * and raise typed errors. One client instance per server process (the engine
 * holds per-connection transports in memory).
 */

export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
    public reason?: string,
    public lesson?: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

const jsonRecord = z.record(z.unknown());

const legalMoveSchema = z.object({
  move_id: z.string().optional(),
  description: z.string().optional(),
  move: jsonRecord,
}).passthrough();

export const legalMovesResultSchema = z.object({
  legal_moves: z.array(legalMoveSchema).optional(),
  moves: z.array(legalMoveSchema).optional(),
  move_menu: z.string().optional(),
}).passthrough();

export const appliedMoveSchema = z.object({
  ok: z.boolean().optional(),
  summary: z.string().optional(),
  move: jsonRecord.optional(),
  player_views: z.record(z.unknown()).optional(),
  next_step: z.string().nullable().optional(),
  briefing: z.string().optional(),
  reason: z.string().optional(),
  lesson: z.string().optional(),
}).passthrough();

export const aiTurnStepSchema = z.object({
  summary: z.string().optional(),
  move: jsonRecord.optional(),
  player_views: z.record(z.unknown()).optional(),
}).passthrough();

export const aiTurnResultSchema = z.object({
  moves: z.array(aiTurnStepSchema).optional(),
  done: z.boolean().optional(),
  next_step: z.string().nullable().optional(),
}).passthrough();

const gameInfoSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  player_counts: z.array(z.number()).optional(),
}).passthrough();

export const listGamesSchema = z.object({
  games: z.array(gameInfoSchema),
}).passthrough();

export const sessionSchema = z.object({
  session_id: z.string(),
  host_token: z.string().optional(),
  seats: z.array(z.object({
    position: z.number(),
    player_id: z.string().optional(),
    token: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export type LegalMovesResult = z.infer<typeof legalMovesResultSchema>;
export type AppliedMove = z.infer<typeof appliedMoveSchema>;
export type AiTurnResult = z.infer<typeof aiTurnResultSchema>;
export type SessionInfo = z.infer<typeof sessionSchema>;
export type ListGamesResult = z.infer<typeof listGamesSchema>;

function extractJson(result: { content?: unknown[] }): unknown {
  const content = result.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new EngineError('engine_empty_result', 'Engine returned no content');
  }
  const first = content[0] as { type?: string; text?: string };
  if (first?.type !== 'text' || typeof first.text !== 'string') {
    throw new EngineError('engine_bad_content', 'Engine content is not a text block');
  }
  try {
    return JSON.parse(first.text);
  } catch {
    throw new EngineError('engine_bad_json', 'Engine text block is not JSON');
  }
}

function checkError(parsed: unknown): void {
  if (parsed && typeof parsed === 'object') {
    const p = parsed as Record<string, unknown>;
    if (p.error) {
      const code = typeof p.error === 'string' ? p.error : 'engine_error';
      throw new EngineError(
        code,
        String(p.message ?? p.error),
        p.reason as string | undefined,
        p.lesson as string | undefined,
      );
    }
  }
}

export interface EngineClientOptions {
  url: string; // e.g. http://localhost:8080/mcp
  bearerToken: string;
}

export class EngineClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected: Promise<void> | null = null;

  constructor(private opts: EngineClientOptions) {
    this.transport = new StreamableHTTPClientTransport(new URL(opts.url), {
      requestInit: {
        headers: { authorization: `Bearer ${opts.bearerToken}` },
      },
    });
    this.client = new Client({ name: 'zekel-universe', version: '0.0.1' });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      this.connected = this.client.connect(this.transport).then(() => undefined);
    }
    return this.connected;
  }

  private async call<T>(tool: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    await this.ensureConnected();
    const raw = await this.client.callTool({ name: tool, arguments: args });
    const parsed = extractJson(raw as { content?: unknown[] });
    checkError(parsed);
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      throw new EngineError(
        'engine_contract_violation',
        `Tool ${tool} returned an unexpected shape: ${validated.error.message}`,
      );
    }
    return validated.data;
  }

  listGames(): Promise<ListGamesResult> {
    return this.call('list_games', {}, listGamesSchema);
  }

  getRules(gameId: string): Promise<Record<string, unknown>> {
    return this.call('get_rules', { game_id: gameId }, z.record(z.unknown()));
  }

  createSession(args: {
    gameId: string;
    seats: Array<{ kind: 'human' | 'ai'; name?: string; table?: 'physical' | 'digital'; difficulty?: string }>;
    options?: Record<string, unknown>;
    hostPlayerId?: string;
  }): Promise<SessionInfo> {
    // Engine arg shapes (zekel src/mcp/schemas.ts): player_id, kind, name,
    // difficulty, table per seat. player_id is required there, so we assign
    // seat positions here (p1, p2, ...) — callers only pick kinds.
    return this.call('create_session', {
      game_id: args.gameId,
      players: args.seats.map((seat, i) => ({
        player_id: `p${i + 1}`,
        kind: seat.kind,
        name: seat.name,
        table: seat.kind === 'human' ? seat.table : undefined,
        difficulty: seat.kind === 'ai' ? seat.difficulty : undefined,
      })),
      options: args.options,
      host_player_id: args.hostPlayerId,
    }, sessionSchema);
  }

  getState(sessionId: string, playerId?: string, token?: string): Promise<Record<string, unknown>> {
    return this.call('get_state', {
      session_id: sessionId,
      player_id: playerId,
      auth_token: token,
    }, z.record(z.unknown()));
  }

  getLegalMoves(sessionId: string, playerId: string, token?: string): Promise<LegalMovesResult> {
    return this.call('get_legal_moves', {
      session_id: sessionId,
      player_id: playerId,
      auth_token: token,
    }, legalMovesResultSchema);
  }

  applyMove(sessionId: string, playerId: string, token: string | undefined, move: Record<string, unknown>): Promise<AppliedMove> {
    return this.call('apply_move', {
      session_id: sessionId,
      player_id: playerId,
      auth_token: token,
      move,
    }, appliedMoveSchema);
  }

  runAiTurn(sessionId: string, playerId: string, token?: string): Promise<AiTurnResult> {
    return this.call('run_ai_turn', { session_id: sessionId, player_id: playerId, auth_token: token }, aiTurnResultSchema);
  }

  undo(sessionId: string, token?: string): Promise<Record<string, unknown>> {
    return this.call('undo', { session_id: sessionId, auth_token: token }, z.record(z.unknown()));
  }

  isGameOver(sessionId: string): Promise<{ over?: boolean; result?: unknown } & Record<string, unknown>> {
    return this.call('is_game_over', { session_id: sessionId },
      z.object({ over: z.boolean().optional(), result: z.unknown().optional() }).passthrough());
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = null;
    }
  }
}
