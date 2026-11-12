// What every glue shares, tested here: the generic template form and the
// guard against a view no glue knows. Each game's own glue tests live with
// the game in zekel-games (packages/<game>/src/glue/__tests__).

import { describe, expect, it } from 'vitest';
import { GLUES } from '../glue';
import type { GlueInput } from '@zekel/glue-kit';
import { templateForm } from '@zekel/glue-kit';

function input(view: unknown, legalMoves: GlueInput['legalMoves'] = [], extra: Partial<GlueInput> = {}): GlueInput {
  return {
    view, previous: null, legalMoves, playerId: extra.playerId ?? null, reference: extra.reference ?? null,
    seq: extra.seq ?? 1, engineMove: extra.engineMove ?? null, actorPlayerId: extra.actorPlayerId ?? null,
    memory: extra.memory ?? new Map(),
  };
}

describe('the generic template form', () => {
  it('asks for every field of a move the engine says to fill in, typed from the template, with nothing preselected', () => {
    const skeleton = {
      move_id: 'setup', description: "Set up the R1 encounter — FILL IN the player's choices: crew_names, start_location (r9c1 or r9c9), threat_level (1-3), attacker_placements (exactly 3).",
      move: { type: 'setup_encounter', crew_names: [], include_character: true, start_location: 'r9c1', threat_level: 1, attacker_placements: [] },
    };
    const form = templateForm(skeleton)!;
    expect(form.fields.map((f) => [f.key, f.kind])).toEqual([
      ['crew_names', 'text'], ['include_character', 'choice'], ['start_location', 'text'], ['threat_level', 'number'], ['attacker_placements', 'text'],
    ]);
    expect((form.fields[2] as { placeholder?: string }).placeholder).toBe('r9c1');
    // The template's defaults are not answers: every field must be answered
    // (a list may be answered with nothing, on purpose).
    expect(form.build({})).toBeNull();
    expect(form.build({ crew_names: '', include_character: 'yes', start_location: 'r9c9', threat_level: '2' })).toBeNull();
    expect(form.build({ crew_names: '', include_character: 'yes', start_location: 'r9c9', threat_level: '2', attacker_placements: 'r1c2, r3c3, r5c1' }))
      .toEqual({ type: 'setup_encounter', crew_names: [], include_character: true, start_location: 'r9c9', threat_level: 2, attacker_placements: ['r1c2', 'r3c3', 'r5c1'] });
    expect(form.editableKeys).toEqual(['crew_names', 'include_character', 'start_location', 'threat_level', 'attacker_placements']);
  });
  it('asks only for the blanks of a move with empty strings, and nothing for a complete move', () => {
    const blanks = { move_id: 'n', description: 'Name it.', move: { type: 'rename', name: '', keep: 'x' } };
    expect(templateForm(blanks)!.fields.map((f) => f.key)).toEqual(['name']);
    expect(templateForm({ move_id: 'p', description: 'Pass.', move: { type: 'pass' } })).toBeNull();
    expect(templateForm({ move_id: 'r', description: 'Recall ALL your units.', move: { type: 'recall', units: ['leader'] } })).toBeNull();
  });
});

describe('guards', () => {
  it('every glue refuses unknown view shapes and falls back to the JSON inspector', () => {
    const junk = { nonsense: true };
    for (const g of Object.values(GLUES)) {
      expect(g.plan(input(junk))).toBeNull();
    }
  });
});
