// The surface of the engine the server depends on. EngineClient implements
// this against the real MCP service; tests inject a mock against the same
// interface. Everything the server touches goes through here — nothing else
// knows tool names or response shapes. Engine player ids (p1, p2, ...) are
// assigned from seat positions by the client, so this interface speaks in
// seat positions and the server never needs to map.

import type {
  AppliedMove,
  AiTurnResult,
  ListGamesResult,
  SessionInfo,
} from '@universe/engine-client';

export interface EngineService {
  listGames(): Promise<ListGamesResult>;
  getRules(gameId: string): Promise<Record<string, unknown>>;
  createSession(args: {
    gameId: string;
    seats: Array<{ kind: 'human' | 'ai'; name?: string; table?: 'physical' | 'digital'; difficulty?: string }>;
    options?: Record<string, unknown>;
    hostPlayerId?: string;
  }): Promise<SessionInfo>;
  getState(sessionId: string, playerId?: string, token?: string): Promise<Record<string, unknown>>;
  getLegalMoves(sessionId: string, playerId: string, token?: string): Promise<unknown>;
  applyMove(sessionId: string, playerId: string, token: string | undefined, move: Record<string, unknown>): Promise<AppliedMove>;
  runAiTurn(sessionId: string, playerId: string, token?: string): Promise<AiTurnResult>;
  undo(sessionId: string, token?: string): Promise<Record<string, unknown>>;
  isGameOver(sessionId: string): Promise<{ over?: boolean; result?: unknown } & Record<string, unknown>>;
}

export class EngineRejectedMove extends Error {
  constructor(
    public readonly reason: string,
    public readonly lesson: string,
  ) {
    super(reason);
    this.name = 'EngineRejectedMove';
  }
}
