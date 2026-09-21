// Player agency, from the plan's two running rules: a decision the printed
// rules give to a player is never made by the server or the interface.
// Every move the browser submits goes through submitMove() below with the
// trigger that caused it, and the only triggers are:
//   1. a person's tap on a lit part or a numbered menu row,
//   2. the Roll/Draw button the person pressed, which submits only a
//      resolve_report,
//   3. an undo the person pressed,
//   4. a form the person filled in and sent, which completes one template
//      move the engine listed: every field the form did not ask about is the
//      template's, and every answer is the person's,
//   5. a batch the person pressed once ("play all resources"), which sends
//      its moves one at a time, each only once the engine lists it after the
//      previous one landed, and stops the moment one is not listed.
// Nothing else ever submits. The table test renders the page with a fake
// socket and asserts no submission happens without a simulated tap.

import type { LegalMove } from '@universe/shared';

export type SubmissionTrigger = 'tap' | 'resolve_report_button' | 'undo' | 'form' | 'batch';

/** What a form submission completes: the listed template and the keys the
 *  person was asked about. */
export interface FormContext {
  template: Record<string, unknown>;
  editableKeys: string[];
}

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
  form?: FormContext,
): boolean {
  switch (trigger) {
    case 'form':
      // The template must be one the engine listed, the move must keep every
      // key the form did not ask about exactly as the template had it, and
      // it must not invent keys beyond the template's and the form's.
      if (!form || !legalMoves.some((m) => movesEqual(m.move, form.template))) return false;
      return completesTemplate(move, form.template, form.editableKeys);
    case 'tap':
      // A person tapped a lit part, a numbered menu row or an action-bar
      // button: the move must be one the engine listed.
      return legalMoves.some((m) => movesEqual(m.move, move));
    case 'batch':
      // One press, several moves: each is sent only while the engine lists
      // it, against the menu the engine returned after the previous one.
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

/** True when `move` is `template` with only `editableKeys` changed or added. */
export function completesTemplate(
  move: Record<string, unknown>,
  template: Record<string, unknown>,
  editableKeys: string[],
): boolean {
  const editable = new Set(editableKeys);
  for (const k of Object.keys(template)) {
    if (editable.has(k)) continue;
    if (!(k in move) || JSON.stringify(move[k]) !== JSON.stringify(template[k])) return false;
  }
  for (const k of Object.keys(move)) {
    if (!(k in template) && !editable.has(k)) return false;
  }
  return true;
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
  form?: FormContext,
): Promise<T | null> {
  if (!isSubmissionAllowed(trigger, move, legalMoves, form)) {
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
