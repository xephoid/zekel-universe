// The surface of the engine the server depends on. EngineClient implements
// this against the real MCP service; tests inject a mock against the same
// interface. Everything the server touches goes through here — nothing else
// knows tool names or response shapes. Engine player ids (p1, p2, ...) are
// assigned from seat positions by the client, so this interface speaks in
// seat positions and the server never needs to map.

import type {
  AppliedMove,
  AiTurnResult,
  CreateSessionResult,
  GameOverResult,
  GetStateResult,
  LegalMovesResult,
  ListGamesResult,
  NextStep,
  SeatConfig,
} from '@universe/engine-client';

export type EngineService = {
  listGames(): Promise<ListGamesResult>;
  getRules(gameId: string, topic?: string): Promise<Record<string, unknown>>;
  createSession(args: {
    gameId: string;
    seats: SeatConfig[];
    options?: Record<string, unknown>;
    hostPlayerId?: string;
  }): Promise<CreateSessionResult>;
  getState(sessionId: string, playerId: string, token?: string): Promise<GetStateResult>;
  getLegalMoves(sessionId: string, playerId: string, token?: string): Promise<LegalMovesResult>;
  applyMove(
    sessionId: string,
    playerId: string,
    token: string | undefined,
    move: Record<string, unknown> | { moveId: string },
  ): Promise<AppliedMove>;
  runAiTurn(sessionId: string, playerId: string, token?: string): Promise<AiTurnResult>;
  undo(sessionId: string, token?: string): Promise<Record<string, unknown>>;
  isGameOver(sessionId: string): Promise<GameOverResult>;
};

export function nextStepIsAi(nextStep: NextStep | null | undefined): boolean {
  return nextStep?.status === 'ai_to_move';
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
