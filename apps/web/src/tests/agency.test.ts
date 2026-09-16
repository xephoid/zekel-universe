// The agency policy: the only submissions are a person's tap on a listed
// legal move, the Roll/Draw button for a resolve_report, and an undo. The
// rendered-table test (table.test.tsx) proves the page obeys it.

import { describe, expect, it } from 'vitest';
import { classifyMoves, isSubmissionAllowed, submitMove, submissionLog } from '../glue';
import type { LegalMove } from '../glue';

const two: LegalMove[] = [
  { move_id: 'a', description: 'a', move: { type: 'play_card', card_id: 'attack', hand_index: 0 } },
  { move_id: 'b', description: 'b', move: { type: 'play_card', card_id: 'block', hand_index: 1 } },
];
const roll: LegalMove[] = [{ move_id: 'r', description: 'Roll', move: { type: 'resolve_report' } }];

describe('agency policy', () => {
  it('a tap submits only a listed legal move', () => {
    expect(isSubmissionAllowed('tap', { type: 'play_card', card_id: 'attack', hand_index: 0 }, two)).toBe(true);
    expect(isSubmissionAllowed('tap', { type: 'end_turn' }, two)).toBe(false);
  });
  it('the Roll/Draw button submits only resolve_report, and only when offered', () => {
    expect(isSubmissionAllowed('resolve_report_button', { type: 'resolve_report' }, roll)).toBe(true);
    expect(isSubmissionAllowed('resolve_report_button', { type: 'resolve_report' }, two)).toBe(false);
    expect(isSubmissionAllowed('resolve_report_button', { type: 'play_card', hand_index: 0 }, two)).toBe(false);
  });
  it('undo is the only other submission', () => {
    expect(isSubmissionAllowed('undo', { type: 'undo' }, two)).toBe(true);
    expect(isSubmissionAllowed('undo', { type: 'end_turn' }, two)).toBe(false);
  });
  it('there is no sole-legal-move or timer trigger at all', () => {
    // A single legal move still waits for the person.
    const only: LegalMove[] = [{ move_id: 'x', description: 'Ack', move: { type: 'acknowledge' } }];
    expect(isSubmissionAllowed('tap', { type: 'acknowledge' }, only)).toBe(true);
    expect((['tap', 'resolve_report_button', 'undo'] as const).length).toBe(3);
  });
  it('classifies resolve_report as needing the press and everything else a tap', () => {
    const { needsPress, needsTap } = classifyMoves([...two, ...roll]);
    expect(needsPress.map((m) => m.move_id)).toEqual(['r']);
    expect(needsTap.map((m) => m.move_id)).toEqual(['a', 'b']);
  });
  it('submitMove refuses what the policy refuses and logs what it sends', async () => {
    const sent: unknown[] = [];
    const before = submissionLog.length;
    expect(await submitMove('tap', { type: 'end_turn' }, two, async (m) => { sent.push(m); return 'ok'; })).toBeNull();
    expect(sent).toHaveLength(0);
    expect(await submitMove('tap', two[0]!.move, two, async (m) => { sent.push(m); return 'ok'; })).toBe('ok');
    expect(sent).toHaveLength(1);
    expect(submissionLog.length).toBe(before + 1);
    expect(submissionLog[submissionLog.length - 1]).toEqual({ trigger: 'tap', move: two[0]!.move });
  });
});
