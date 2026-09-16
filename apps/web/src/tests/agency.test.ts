// The agency check from the plan: for every game, every move Universe could
// ever send without a person's tap must be
//   (a) a resolve_report that requires the Roll/Draw button press,
//   (b) an undo, or
//   (c) a no-choice acknowledgement the engine offers as the ONLY legal move.
// We scan representative legal-move sets per game and assert the classifier
// agrees, then assert the policy function rejects everything else.

import { describe, expect, it } from 'vitest';
import { GLUES, classifyMoves, isAutoSubmitAllowed } from '../glue';
import type { LegalMove } from '../glue';

const SETS: Record<string, LegalMove[][]> = {
  'fractured-fist': [
    [
      { move_id: 'p1', description: 'Play Attack', move: { type: 'play_card', card_id: 'attack', hand_index: 0 } },
      { move_id: 'p2', description: 'End turn', move: { type: 'end_turn' } },
    ],
    [{ move_id: 's', description: 'Skip remaining refines', move: { type: 'skip_refine' } }],
  ],
  'warble-way-galaxy': [
    [
      { move_id: 'roll', description: 'Roll 3d6 + SNE to research', move: { type: 'resolve_report' } },
      { move_id: 'buy', description: 'Buy laser pistol', move: { type: 'buy_item', item_id: 'lp' } },
    ],
    [{ move_id: 'ack', description: 'Acknowledge', move: { type: 'acknowledge' } }],
  ],
  'sweetlands-imperium': [
    [
      { move_id: 'm1', description: 'Play red Intel', move: { type: 'play_intel', hand_index: 0 } },
      { move_id: 'roll', description: 'Roll knight battle', move: { type: 'resolve_report' } },
    ],
  ],
  'cybernoir-2127': [
    [
      { move_id: 'pl', description: 'Play Dark City Central Station', move: { type: 'play_location', location_name: 'Dark City Central Station' } },
      { move_id: 'pass', description: 'Pass', move: { type: 'pass_turn' } },
    ],
  ],
};

describe('agency', () => {
  it('for every game, moves needing a press are exactly resolve_report', () => {
    for (const [game, sets] of Object.entries(SETS)) {
      void GLUES[game];
      for (const set of sets) {
        const { autoSubmittable, mustBePressed } = classifyMoves(set);
        for (const m of mustBePressed) {
          expect(m.move['type']).toBe('resolve_report');
        }
        for (const m of autoSubmittable) {
          // sole-legal-move autoadvance is only legal when the set is size 1
          expect(set.length).toBe(1);
        }
      }
    }
  });

  it('policy admits only the three sanctioned auto-submits', () => {
    const two: LegalMove[] = [
      { move_id: 'a', description: 'a', move: { type: 'play_card', card_id: 'attack', hand_index: 0 } },
      { move_id: 'b', description: 'b', move: { type: 'play_card', card_id: 'block', hand_index: 1 } },
    ];
    // a person's tap: always fine
    expect(isAutoSubmitAllowed('click', { type: 'play_card', hand_index: 0 }, two)).toBe(true);
    // the Roll/Draw button: only resolve_report
    expect(isAutoSubmitAllowed('resolve_report_button', { type: 'resolve_report' }, two)).toBe(true);
    expect(isAutoSubmitAllowed('resolve_report_button', { type: 'play_card', hand_index: 0 }, two)).toBe(false);
    // undo
    expect(isAutoSubmitAllowed('undo', { type: 'undo' }, two)).toBe(true);
    // sole legal move — only when it really is the only one
    const only: LegalMove[] = [{ move_id: 'x', description: 'Ack', move: { type: 'acknowledge' } }];
    expect(isAutoSubmitAllowed('sole_legal_move', { type: 'acknowledge' }, only)).toBe(true);
    expect(isAutoSubmitAllowed('sole_legal_move', { type: 'play_card', hand_index: 0 }, two)).toBe(false);
    // nothing else ever auto-submits
    expect(isAutoSubmitAllowed('sole_legal_move', { type: 'end_turn' }, only)).toBe(false);
  });
});
