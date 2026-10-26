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
  return /FILL IN|do not submit this skeleton|edit (it|to)|— edit/i.test(d) || blankKeys(move.move).length > 0;
}

/** Top-level keys whose value is a blank the player must fill: an empty string. */
export function blankKeys(move: Record<string, unknown>): string[] {
  return Object.keys(move).filter((k) => k !== 'type' && move[k] === '');
}

/**
 * The generic form for a template the glue did not describe. A move with
 * blank strings asks for those; a move whose description says to fill it
 * in asks for every field, typed from the template's own values: a string
 * is text, a number a number, a boolean a yes-or-no choice, a list of
 * scalars a comma-separated list. The template's values show as
 * placeholders and never count as answers; a list may be left empty on
 * purpose (the help says so), everything else must be answered.
 */
export function templateForm(move: LegalMove): MoveForm | null {
  const blanks = blankKeys(move.move);
  const whole = /FILL IN|do not submit this skeleton|edit (it|to)|— edit/i.test(move.description ?? '');
  const keys = whole ? Object.keys(move.move).filter((k) => k !== 'type' && kindOf(move.move[k]) !== null) : blanks;
  if (keys.length === 0) return null;
  const fields: FormField[] = keys.map((k) => {
    const v = move.move[k];
    const kind = kindOf(v) ?? 'text';
    const placeholder = v === '' ? undefined : Array.isArray(v) ? v.join(', ') : String(v);
    if (kind === 'number') return { kind: 'number', key: k, label: words(k), help: placeholder ? `the listing shows ${placeholder}` : undefined };
    if (kind === 'boolean') return { kind: 'choice', key: k, label: words(k), options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] };
    if (kind === 'list') return { kind: 'text', key: k, label: words(k), placeholder, help: 'Separate with commas; leave empty for none.', maxLength: 200 };
    return { kind: 'text', key: k, label: words(k), placeholder, maxLength: 60 };
  });
  return {
    title: words(String(move.move['type'] ?? 'move')),
    help: move.description,
    fields,
    template: move,
    editableKeys: keys,
    build(answers) {
      const out: Record<string, unknown> = { ...move.move };
      for (const k of keys) {
        const kind = kindOf(move.move[k]) ?? 'text';
        const v = answers[k];
        if (kind === 'list') {
          if (typeof v !== 'string') return null;
          out[k] = v.split(',').map((x) => x.trim()).filter(Boolean);
          continue;
        }
        if (kind === 'boolean') {
          if (v !== 'yes' && v !== 'no') return null;
          out[k] = v === 'yes';
          continue;
        }
        if (kind === 'number') {
          const n = answerNumber(answers, k);
          if (n === null) return null;
          out[k] = n;
          continue;
        }
        if (typeof v !== 'string' || v.trim() === '') return null;
        out[k] = v.trim();
      }
      return out;
    },
  };
}

/** The question a template value asks for, or null for a shape no generic
 *  field can hold (an object: the glue must describe it). */
function kindOf(v: unknown): 'text' | 'number' | 'boolean' | 'list' | null {
  if (typeof v === 'string') return 'text';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) return 'list';
  return null;
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
