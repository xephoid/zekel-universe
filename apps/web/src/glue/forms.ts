// Template moves and choosers, shared by every glue and the table page.
//
// The engine lists some legal moves as templates: a skeleton with blanks
// ("FILL IN the values the player chose — do not submit this skeleton") or
// with a convenience default the description says to edit. Sending one as
// listed would make the interface decide for the player, so the table asks
// instead. A glue may describe a template's questions precisely (formFor);
// this module supplies the fallback that reads the blanks off the template
// itself, and the chooser rule for taps that could mean several moves.

import type { LegalMove, SelectEvent } from './types';
import type { FormField, GlueInput, GlueModule, MoveForm } from './types';
import { isObj, words } from './types';

/** Every move a tap could mean, through the glue's chooser when it has one. */
export function movesForSelect(glue: GlueModule, sel: SelectEvent, input: GlueInput): LegalMove[] {
  if (glue.movesForSelect) return glue.movesForSelect(sel, input);
  const one = glue.moveForSelect(sel, input);
  return one ? [one] : [];
}

/** The form a move needs before it can be sent: the glue's, else the
 *  generic one, else none (the move is complete as listed). */
export function formForMove(glue: GlueModule | null, move: LegalMove, input: GlueInput): MoveForm | null {
  const own = glue?.formFor?.(move, input) ?? null;
  if (own) return own;
  return templateForm(move);
}

/** True when the description marks the move as a skeleton to complete. */
export function looksLikeTemplate(move: LegalMove): boolean {
  const d = move.description ?? '';
  return /\bFILL IN\b|do not submit this skeleton|edit (it|to)\b|— edit\b/i.test(d) || blankKeys(move.move).length > 0;
}

/** Top-level keys whose value is a blank the player must fill: an empty string. */
export function blankKeys(move: Record<string, unknown>): string[] {
  return Object.keys(move).filter((k) => k !== 'type' && move[k] === '');
}

/**
 * The generic form: one text question per blank string on the template.
 * Blanks of other shapes (an empty scores object, a default map) need the
 * glue's own formFor; without one the move is still sendable as listed only
 * if it has no blanks, so a glue that forgets a form gets a text form for
 * the blanks it can see and nothing silent.
 */
export function templateForm(move: LegalMove): MoveForm | null {
  const blanks = blankKeys(move.move);
  if (blanks.length === 0) return null;
  const fields: FormField[] = blanks.map((k) => ({ kind: 'text', key: k, label: words(k), maxLength: 60 }));
  return {
    title: words(String(move.move['type'] ?? 'move')),
    help: move.description,
    fields,
    template: move,
    editableKeys: blanks,
    build(answers) {
      const out: Record<string, unknown> = { ...move.move };
      for (const k of blanks) {
        const v = answers[k];
        if (typeof v !== 'string' || v.trim() === '') return null;
        out[k] = v.trim();
      }
      return out;
    },
  };
}

/** Read an answer as a trimmed string, or null. */
export function answerText(answers: Record<string, unknown>, key: string): string | null {
  const v = answers[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Read an answer as a list of strings (a multi pick), or []. */
export function answerList(answers: Record<string, unknown>, key: string): string[] {
  const v = answers[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Read an answer as a finite number, or null. */
export function answerNumber(answers: Record<string, unknown>, key: string): number | null {
  const v = answers[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export { isObj };
