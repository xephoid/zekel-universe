import { describe, it, expect } from 'vitest';
import {
  createSessionSchema,
  legalMovesResultSchema,
  nextStepSchema,
  appliedMoveSchema,
} from '../index.js';

describe('engine-client schemas', () => {
  it('accepts a legal moves payload with a structured move menu', () => {
    const parsed = legalMovesResultSchema.safeParse({
      session_id: 's1',
      player_id: 'p1',
      is_their_turn: true,
      legal_moves: [{ move_id: 'm1', move: { type: 'play_card', card_id: 'a1', hand_index: 0 }, description: 'Play a1' }],
      move_menu: {
        prompt: 'Your move?',
        entries: [{ key: '1', label: 'Play a1', move_id: 'm1' }],
        total_moves: 1,
        collapsed: false,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a legal-moves payload with no legal_moves array', () => {
    expect(legalMovesResultSchema.safeParse({ session_id: 's1' }).success).toBe(false);
  });

  it('next_step is an object with status/active_player_id/instruction', () => {
    expect(nextStepSchema.safeParse({
      status: 'ai_to_move', active_player_id: 'p2', instruction: '…',
    }).success).toBe(true);
    // a bare string is NOT a valid next_step
    expect(nextStepSchema.safeParse('ai to move').success).toBe(false);
  });

  it('rejects a session payload without session_id', () => {
    expect(createSessionSchema.safeParse({}).success).toBe(false);
  });

  it('accepts the real create_session shape (next_step object, join block)', () => {
    const parsed = createSessionSchema.safeParse({
      session_id: 's1',
      game_id: 'fractured-fist',
      active_player_id: 'p1',
      players_recorded: [{ player_id: 'p1', kind: 'human' }],
      next_step: { status: 'human_to_move', active_player_id: 'p1', instruction: '…' },
      join: { join_code: 'AB12', host_player_id: 'p1', host_token: 'tok', open_seats: ['p2'] },
    });
    expect(parsed.success).toBe(true);
  });

  it('apply_move result requires applied:true + state_summary + next_step object', () => {
    const parsed = appliedMoveSchema.safeParse({
      session_id: 's1',
      applied: true,
      state_summary: 'played Attack for 1',
      next_active_player_id: 'p2',
      next_step: { status: 'ai_to_move', active_player_id: 'p2', instruction: '…' },
      game_over: false,
    });
    expect(parsed.success).toBe(true);
  });
});
