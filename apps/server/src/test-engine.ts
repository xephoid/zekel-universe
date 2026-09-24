// A scripted fake engine for server tests, implementing the same
// EngineService the real client does. It knows no game rules: it hands out
// per-seat views that differ per seat and change per move, follows a small
// script for whose turn is next, and throws the engine's real error shapes.

import { EngineError } from '@universe/engine-client';
import type {
  AiTurnResult, AppliedMove, CreateSessionResult, GameOverResult, GetRulesResult, GetStateResult,
  LegalMovesResult, ListGamesResult, MoveArg, NextStep, SeatConfig, UndoResult,
} from '@universe/engine-client';

interface Result { winners: string[]; scores: Record<string, number>; summary: string }
import type { EngineService } from './engine.js';

interface FakeSession {
  id: string;
  gameId: string;
  seats: SeatConfig[];
  moves: number;
  active: string;
  over: Result | null;
  history: string[];
}

const RESULT: Result = { winners: ['p1'], scores: { p1: 5, p2: 3 }, summary: 'p1 wins 5 to 3.' };

export class FakeEngine implements EngineService {
  sessions = new Map<string, FakeSession>();
  counter = 0;
  /** every apply_move call, in order */
  applied: Array<{ session: string; player: string; move: Record<string, unknown> }> = [];
  queries: Array<{ session: string; player: string; name: string; args: Record<string, unknown> }> = [];
  aiTurns = 0;
  createdWith: Array<{ kind: string; table?: string; difficulty?: string }> = [];
  lastOptions: Record<string, unknown> | undefined;
  /** how many moves each AI turn plays */
  aiMovesPerTurn = 2;
  /** the AI opens the game instead of the first human */
  aiOpens = false;
  /** the AI's turn ends the game */
  aiWins = false;
  /** engine refuses the undo */
  refuseUndo = false;
  /** make getState fail (engine down) */
  stateFails = false;

  private nextId(): string {
    this.counter += 1;
    return `session-${this.counter}`;
  }

  private session(id: string): FakeSession {
    const s = this.sessions.get(id);
    if (!s) throw new EngineError('SESSION_NOT_FOUND', `No session ${id}`);
    return s;
  }

  private humans(s: FakeSession): string[] {
    return s.seats.filter((x) => x.kind === 'human').map((x) => x.playerId!);
  }

  private ais(s: FakeSession): string[] {
    return s.seats.filter((x) => x.kind === 'ai').map((x) => x.playerId!);
  }

  private nextStep(s: FakeSession): NextStep {
    if (s.over) return { status: 'game_over', active_player_id: null, instruction: 'Game over.' };
    const isAi = this.ais(s).includes(s.active);
    return {
      status: isAi ? 'ai_to_move' : 'human_to_move',
      active_player_id: s.active,
      instruction: isAi ? `It is ${s.active} (AI).` : `It is ${s.active}.`,
    };
  }

  private afterHuman(s: FakeSession, who: string): string {
    const order = s.seats.map((x) => x.playerId!);
    const i = order.indexOf(who);
    return order[(i + 1) % order.length]!;
  }

  async listGames(): Promise<ListGamesResult> {
    return {
      games: [
        {
          game_id: 'fractured-fist', name: 'Fractured Fist', description: 'd',
          min_players: 2, max_players: 2, supports_ai: true,
          has_hidden_information: true, options_schema: { type: 'object', properties: {} },
        },
        {
          game_id: 'trio', name: 'Trio', description: 'd',
          min_players: 2, max_players: 4, supports_ai: true,
          has_hidden_information: true, options_schema: {},
        },
      ],
    };
  }

  async getRules(gameId: string): Promise<GetRulesResult> {
    return { game_id: gameId, rules: 'Rules text.', reference_data: { cards: [{ id: 'attack', name: 'Attack', cost: 4 }], max_missteps: 10 }, move_schema: {} };
  }

  async createSession(args: {
    gameId: string; seats: SeatConfig[]; options?: Record<string, unknown>; hostPlayerId?: string;
  }): Promise<CreateSessionResult> {
    const seats = args.seats.map((s, i) => ({ ...s, playerId: s.playerId ?? `p${i + 1}` }));
    this.createdWith = seats.map((s) => ({ kind: s.kind, table: s.table, difficulty: s.difficulty }));
    this.lastOptions = args.options;
    const id = this.nextId();
    const s: FakeSession = { id, gameId: args.gameId, seats, moves: 0, active: seats[0]!.playerId!, over: null, history: [] };
    if (this.aiOpens) s.active = this.ais(s)[0] ?? s.active;
    this.sessions.set(id, s);
    const humans = this.humans(s);
    return {
      session_id: id,
      players_recorded: seats.map((x) => ({ player_id: x.playerId!, kind: x.kind, ...(x.table ? { table: x.table } : {}) })),
      next_step: this.nextStep(s),
      ...(humans.length >= 2
        ? { join: { join_code: 'AB12', host_player_id: args.hostPlayerId ?? humans[0]!, host_token: `host-token-${id}`, open_seats: humans.slice(1) } }
        : {}),
    };
  }

  private view(s: FakeSession, playerId: string): Record<string, unknown> {
    return { player: playerId, hand: [`secret-of-${playerId}`], moves: s.moves, active: s.active };
  }

  async getState(sessionId: string, playerId: string): Promise<GetStateResult> {
    if (this.stateFails) throw new EngineError('engine_call_failed', 'engine down');
    const s = this.session(sessionId);
    return {
      ...this.view(s, playerId),
      log: [],
      scoreboard: {},
      next_step: this.nextStep(s),
      move_menu: s.active === playerId ? { prompt: 'Pick', entries: [{ key: '1', label: 'Pass', move_id: 'pass' }] } : null,
    };
  }

  private legal(s: FakeSession, playerId: string) {
    if (s.active !== playerId || s.over) return [];
    return [
      { move_id: 'pass', description: 'Pass', move: { type: 'pass' } },
      { move_id: 'win', description: 'Win', move: { type: 'win' } },
    ];
  }

  /** The scripted game answers one question, "echo", with its arguments. */
  async queryChoice(sessionId: string, playerId: string, _token: string | undefined, name: string, args: Record<string, unknown>): Promise<{ answer: unknown }> {
    this.session(sessionId);
    if (name !== 'echo') throw new EngineError('ILLEGAL_MOVE', `The test game answers no question named "${name}"`);
    this.queries.push({ session: sessionId, player: playerId, name, args });
    return { answer: { playerId, args } };
  }

  async getLegalMoves(sessionId: string, playerId: string): Promise<LegalMovesResult> {
    const s = this.session(sessionId);
    const legal_moves = this.legal(s, playerId);
    return {
      legal_moves,
      is_their_turn: s.active === playerId,
      move_menu: { prompt: 'Your move', entries: legal_moves.map((m, i) => ({ key: String(i + 1), label: m.description, move_id: m.move_id })) },
      ...(s.moves === 0 && s.active === playerId
        ? { rules_briefing: { for_player: playerId, sections: [{ id: 'first', title: 'First move', text: 'Play something.' }] } }
        : {}),
    };
  }

  async applyMove(sessionId: string, playerId: string, _token: string | undefined, arg: MoveArg): Promise<AppliedMove> {
    const s = this.session(sessionId);
    const move = 'move' in arg ? arg.move : { type: arg.moveId };
    this.applied.push({ session: sessionId, player: playerId, move });
    const type = String(move['type']);
    if (type === 'illegal') {
      throw new EngineError('ILLEGAL_MOVE', 'Not now.', {
        rules_briefing: { sections: [{ id: 'turn-order', title: 'Turn order', text: 'Play happens clockwise.' }] },
        recovery: { next_step: this.nextStep(s), your_legal_moves: this.legal(s, playerId), hint: 'Pick a legal move.' },
      });
    }
    if (type === 'lost') throw new EngineError('engine_call_failed', 'connection lost');
    if (type === 'crash') throw new EngineError('STORAGE_ERROR', 'disk full');
    if (s.active !== playerId) {
      throw new EngineError('NOT_YOUR_TURN', 'Not your turn.', { recovery: { next_step: this.nextStep(s) } });
    }
    s.moves += 1;
    s.history.push(`${playerId}:${type}`);
    if (type === 'win') {
      s.over = RESULT;
      return { applied: true, state_summary: `${playerId} wins.`, next_step: this.nextStep(s), game_over: true, result: RESULT };
    }
    s.active = this.afterHuman(s, playerId);
    return {
      applied: true,
      state_summary: `${playerId} passes.`,
      next_step: this.nextStep(s),
      game_over: false,
      ...(s.moves === 1 ? { rules_briefing: { for_player: playerId, sections: [{ id: 'pass', title: 'Passing', text: 'A pass ends your turn.' }] } } : {}),
    };
  }

  async runAiTurn(sessionId: string, playerId: string): Promise<AiTurnResult> {
    const s = this.session(sessionId);
    this.aiTurns += 1;
    const moves = [];
    for (let i = 0; i < this.aiMovesPerTurn; i++) {
      s.moves += 1;
      s.history.push(`${playerId}:ai${i}`);
      const player_views: Record<string, unknown> = {};
      for (const h of this.humans(s)) player_views[h] = this.view(s, h);
      moves.push({ player_id: playerId, move_taken: { type: `ai-${i}` }, narration: 'ai', state_summary: `AI move ${i + 1}.`, player_views });
    }
    if (this.aiWins) {
      s.over = RESULT;
      return { moves, next_step: this.nextStep(s), game_over: true, result: RESULT };
    }
    s.active = this.humans(s)[0]!;
    return { moves, next_step: this.nextStep(s), game_over: false };
  }

  async undo(sessionId: string): Promise<UndoResult> {
    const s = this.session(sessionId);
    if (this.refuseUndo) return { undone: false, message: 'Nothing to undo.' };
    // Revert the last human move and every AI move after it, as one unit.
    while (s.history.length && !s.history[s.history.length - 1]!.includes(':pass')) s.history.pop();
    if (s.history.length) s.history.pop();
    s.moves = s.history.length;
    s.active = this.humans(s)[0]!;
    s.over = null;
    return { undone: true, next_step: this.nextStep(s) };
  }

  /** The public view: every human's view minus its hand, plus a marker. */
  async getPublicView(_gameId: string, sessionId: string): Promise<unknown> {
    const s = this.session(sessionId);
    return { public: true, moves: s.moves, active: s.active, players: this.humans(s).map((h) => ({ player: h, hand_size: 1 })) };
  }

  async isGameOver(sessionId: string): Promise<GameOverResult> {
    const s = this.session(sessionId);
    return s.over ? { game_over: true, ...s.over } : { game_over: false };
  }
}
