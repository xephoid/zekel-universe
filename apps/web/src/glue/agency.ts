// Player agency, from the plan's two running rules: a decision the printed
// rules give to a player is never made by the server or the interface.
// Every move the browser submits goes through submitMove() below with the
// trigger that caused it, and the only triggers are:
//   1. a person's tap on a lit part or a numbered menu row,
//   2. the Roll/Draw button the person pressed, which submits only a
//      resolve_report,
//   3. an undo the person pressed.
// Nothing else ever submits. The table test renders the page with a fake
// socket and asserts no submission happens without a simulated tap.

import type { LegalMove } from '@universe/shared';

export type SubmissionTrigger = 'tap' | 'resolve_report_button' | 'undo';

export interface Submission {
  trigger: SubmissionTrigger;
  move: Record<string, unknown>;
}

/** A record of every submission the browser has made, for the agency test. */
export const submissionLog: Submission[] = [];

/**
 * Returns true when this submission respects agency.
 * `trigger` is who caused the send; `legalMoves` is the menu at send time.
 */
export function isSubmissionAllowed(
  trigger: SubmissionTrigger,
  move: Record<string, unknown>,
  legalMoves: LegalMove[],
): boolean {
  switch (trigger) {
    case 'tap':
      // A person tapped a lit part or a numbered menu row: the move must be
      // one the engine listed.
      return legalMoves.some((m) => movesEqual(m.move, move));
    case 'resolve_report_button':
      // The Roll/Draw button submits ONLY resolve_report, and the person
      // pressed it. Nothing else ever resolves randomness.
      return (move['type'] === 'resolve_report' || move['action'] === 'resolve_report')
        && legalMoves.some((m) => movesEqual(m.move, move));
    case 'undo':
      return move['type'] === 'undo';
  }
}

export function movesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

/**
 * The one door every submission goes through. Refuses anything the policy
 * does not allow, records what it sent, and hands the move to the sender.
 */
export async function submitMove<T>(
  trigger: SubmissionTrigger,
  move: Record<string, unknown>,
  legalMoves: LegalMove[],
  send: (move: Record<string, unknown>) => Promise<T>,
): Promise<T | null> {
  if (!isSubmissionAllowed(trigger, move, legalMoves)) {
    // eslint-disable-next-line no-console
    console.warn('[agency] refused a submission', trigger, move);
    return null;
  }
  submissionLog.push({ trigger, move });
  return send(move);
}

/** Roll/Draw moves need the button; everything else needs a tap. */
export function classifyMoves(legalMoves: LegalMove[]): { needsPress: LegalMove[]; needsTap: LegalMove[] } {
  const needsPress: LegalMove[] = [];
  const needsTap: LegalMove[] = [];
  for (const m of legalMoves) {
    const t = m.move['type'] ?? m.move['action'];
    if (t === 'resolve_report') needsPress.push(m);
    else needsTap.push(m);
  }
  return { needsPress, needsTap };
}
