// Neither Guts nor Gears. The table draws its own screen (NggScreen): the map,
// the seat's faction board, the action stack, and the one decision the state
// routes to. The plan below is only the top bar's words for the shared table
// chrome; the screen does the drawing.

import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, SetupAnswers, SetupField, SetupSeat, TablePlan } from '../types';
import { NggScreen } from './NggScreen';
import { readView } from './read';
import { readRef } from './ref';

const PHASE_WORDS: Record<string, string> = {
  setup_factions: 'Setup',
  setup_leaders: 'Leader draft',
  setup_locations: 'Starting sites',
  setup_done_pending_grants: 'Setup',
  upkeep: 'Upkeep',
  planning: 'Planning phase',
  action: 'Action phase',
  culture: 'Culture income',
  claims: 'Hero claims',
  treaty_break: 'End of round',
  end_of_round: 'End of round',
  game_over: 'Game over',
};

export const nggGlue: GlueModule = {
  gameId: 'neither-guts-nor-gears',
  title: 'Neither Guts nor Gears',
  Screen: NggScreen,

  /** The seat's faction look for the whole page: Ink for a wizard seat, Oil
   *  for a robot seat; the table's own look for a watcher or before a faction. */
  themeFor(input) {
    const v = readView(input.view);
    const species = v?.players.find((p) => p.id === input.playerId)?.species ?? null;
    return species ? `ngg-theme ngg-theme-${species}` : v ? 'ngg-theme' : null;
  },

  plan(input): TablePlan | null {
    const v = readView(input.view);
    if (!v) return null;
    return {
      board: [], bench: [], side: [], palette: {},
      title: 'Neither Guts nor Gears',
      status: `Round ${v.round} · ${PHASE_WORDS[v.phase] ?? v.phase}`,
    };
  },

  litParts() { return []; },
  moveForSelect() { return null; },

  resolveReportMove(legalMoves) {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  /**
   * The faction for every seat, on the setup page. The engine takes all of
   * them in one move from one seat, so the page asks only when every seat is
   * the host or an AI; a table with friends leaves it to the table, where
   * the same move is asked of the reporting seat.
   */
  setupFields(reference: GameReferenceResponse, seats?: SetupSeat[]): SetupField[] {
    if (!seats || seats.some((s) => s.kind === 'human' && !s.host)) return [];
    const ref = readRef(reference);
    if (!ref || ref.factions.length === 0) return [];
    const options = ref.factions.map((f) => ({ value: f.id, label: f.name, hint: `${f.species} · ${f.color}` }));
    return seats.map((s): SetupField => ({
      kind: 'choice',
      key: `faction.p${s.position + 1}`,
      label: s.host ? 'Your faction' : `Seat ${s.position + 1}'s faction (AI${s.aiDifficulty ? `, ${s.aiDifficulty}` : ''})`,
      help: s.host ? 'Three wizard factions, three robot factions. No two seats share one.' : undefined,
      options,
    }));
  },

  setupMoves(answers: SetupAnswers, seats: SetupSeat[]): Array<Record<string, unknown>> {
    const selections: Record<string, string> = {};
    for (const s of seats) {
      const v = answers[`faction.p${s.position + 1}`];
      if (typeof v === 'string' && v) selections[`p${s.position + 1}`] = v;
    }
    return Object.keys(selections).length === seats.length ? [{ type: 'assign_setup_choices', selections }] : [];
  },
};

export default nggGlue;
