// The surface of the engine the server depends on. EngineClient implements
// this against the real MCP service; tests inject a fake against the same
// interface. Everything the server touches goes through here; nothing else
// knows tool names or response shapes.

import type {
  AppliedMove,
  AiTurnResult,
  CreateSessionResult,
  GameOverResult,
  GetRulesResult,
  GetStateResult,
  LegalMovesResult,
  ListGamesResult,
  MoveArg,
  SeatConfig,
  UndoResult,
} from '@universe/engine-client';

export type EngineService = {
  listGames(): Promise<ListGamesResult>;
  getRules(gameId: string, topic?: string): Promise<GetRulesResult>;
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
    arg: MoveArg,
  ): Promise<AppliedMove>;
  runAiTurn(sessionId: string, playerId: string, token?: string): Promise<AiTurnResult>;
  undo(sessionId: string, token?: string): Promise<UndoResult>;
  isGameOver(sessionId: string): Promise<GameOverResult>;
};
