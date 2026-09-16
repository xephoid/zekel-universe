import { describe, it, expect } from 'vitest';
import { legalMovesResultSchema, sessionSchema } from '../index.js';

describe('engine-client schemas', () => {
  it('accepts a legal moves payload with a numbered menu', () => {
    const parsed = legalMovesResultSchema.safeParse({
      legal_moves: [{ move: { type: 'play_card', card: 'a1' }, description: 'Play a1' }],
      move_menu: '1. Play a1',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a session payload without session_id', () => {
    expect(sessionSchema.safeParse({}).success).toBe(false);
  });
});
