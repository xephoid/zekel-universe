// Player agency, from the plan's two running rules: a decision the printed
// rules give to a player is never made by the server or the interface.
// The only moves Universe may ever send on its own behalf are:
//   1. a resolve_report the person pressed the Roll/Draw button for,
//   2. an undo the person pressed, or
//   3. a no-choice acknowledgement the engine offers as the ONLY legal move.
// Anything else fails the agency test.

import type { LegalMove } from './primitiveTree';

export type SubmissionKind = 'click' | 'resolve_report_button' | 'undo' | 'sole_legal_move';

/**
 * Returns true when this submission respects agency.
 * `trigger` is who caused the send; `legalMoves` is the menu at send time.
 */
export function isAutoSubmitAllowed(
  trigger: SubmissionKind,
  move: Record<string, unknown>,
  legalMoves: LegalMove[],
): boolean {
  switch (trigger) {
    case 'click':
      // A person tapped a lit part or a numbered menu row. Always allowed.
      return true;
    case 'resolve_report_button':
      // The Roll/Draw button submits ONLY resolve_report, and the person
      // pressed it. Nothing else ever resolves.
      return move['type'] === 'resolve_report' || move['action'] === 'resolve_report';
    case 'undo':
      // Undo is one engine call the person asked for.
      return move['type'] === 'undo';
    case 'sole_legal_move':
      // A no-choice acknowledgement the engine offers as the single legal
      // move (e.g. "acknowledge"). The engine itself says there is nothing
      // to decide; advancing is not a choice taken on the player's behalf.
      if (legalMoves.length !== 1) return false;
      return movesEqual(legalMoves[0]!.move, move);
  }
}

export function movesEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => k === kb[i] && a[k] === b[k]);
}

/**
 * The scan the test runs: given the engine's legal-move list, classify every
 * move. If `autoSubmittable` is true for any move, it must resolve to one of
 * the three allowed kinds. `resolve_report` always requires the button press.
 */
export function classifyMoves(legalMoves: LegalMove[]): {
  autoSubmittable: LegalMove[];
  mustBePressed: LegalMove[];
} {
  const autoSubmittable: LegalMove[] = [];
  const mustBePressed: LegalMove[] = [];
  for (const m of legalMoves) {
    const t = m.move['type'] ?? m.move['action'];
    if (t === 'resolve_report') {
      mustBePressed.push(m); // shown as the Roll/Draw button; needs the press
    }
  }
  if (legalMoves.length === 1 && mustBePressed.length === 0) {
    autoSubmittable.push(legalMoves[0]!);
  }
  return { autoSubmittable, mustBePressed };
}
