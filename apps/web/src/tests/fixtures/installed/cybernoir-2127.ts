// One view and its reference for Cybernoir 2127, in the shape the game's
// rules give them, to draw the installed glue with. The game's own tests and
// the rest of its fixtures live with it in zekel-games.

import type { GameReferenceResponse } from '@universe/shared';

export const CN_VIEW = {
  phase: 'play', turn: 3, activePlayerId: 'det', playerOrder: ['det', 'hak'],
  pending: null, endgame_triggered: false, endgame_reason: null,
  board: ['Dark City Central Station', 'Xistential Club'],
  informants_facedown_count: 1, informants_revealed: [{ person: 'Anansi the Spider' }],
  jail: { slot_1_booked: ['Blackice'], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: { borough: true, population: false, affiliation: false },
  truthful_values: { borough: 'downtown' },
  negative_clues: ['population_0', 'affiliation_gang_1'],
  safehouse_burned: false, hideout_card_removed: false,
  evidence: { weapon: null, witnesses: ['Eddie the Doorman'], motive_set_1: [], motive_set_2: [], motive_set_3: [], motive_set_4: [] },
  contacts_discard: ['The Weapon'],
  detective: { location_deck_size: 12, location_hand_size: 3, location_discard: ['Shipyard'], poi_deck_size: 30, mid_game_guess_spent: false, ap: 3, overclock_used: false },
  hacker: { contacts_deck_size: 20, contacts_discard_size: 1, hand_size: 2, ap: 2, overclock_used: false },
  overclock_draws_owed: 0, overclock_draw_timing: null,
  role: 'hacker',
  hand: ['Blackice', 'The Weapon'],
  hideout: { location_name: 'The Junction', borough: 'boonies', population: 2, affiliation: 'gang_1' },
  evidence_detail: {},
};

export const CN_REFERENCE: GameReferenceResponse = {
  gameId: 'cybernoir-2127', rules: '', moveSchema: {}, optionsSchema: {},
  referenceData: {
    locations: [
      { name: 'Dark City Central Station', borough: 'downtown', population: 3, affiliation: 'none' },
      { name: 'Xistential Club', borough: 'downtown', population: 1, affiliation: 'gang_2' },
      { name: 'Shipyard', borough: 'boonies', population: 0, affiliation: 'corp_1' },
      { name: 'The Junction', borough: 'boonies', population: 2, affiliation: 'gang_1' },
    ],
    people: [
      { name: 'Blackice', home_location: 'The Junction', affiliation: 'gang_1', cost: 2, ability: 'board_discard', is_witness: false },
      { name: 'Anansi the Spider', home_location: 'The Junction', affiliation: 'gang_2', cost: 1, ability: 'reveal_informant', is_witness: false },
      { name: 'Eddie the Doorman', home_location: 'Xistential Club', affiliation: 'none', cost: 0, ability: 'witness', is_witness: true },
    ],
    affiliations: [
      { id: 'none', name: 'None' },
      { id: 'corp_1', name: 'OmniSuperUltra Corp' },
      { id: 'gang_1', name: 'Iceden Collective' },
      { id: 'gang_2', name: 'Crimson Clan' },
    ],
    boroughs: [
      { id: 'downtown', name: 'Downtown' },
      { id: 'boonies', name: 'Boonies' },
    ],
    evidence: { weapon: 1, witnesses: 3, motive_sets: 3, motive_set_size: 3, total: 13 },
    abilities: [
      { id: 'board_discard', name: 'Board discard', text: 'Discard one Location the Detective has already played from the board.' },
      { id: 'reveal_informant', name: 'Reveal an informant', text: "Turn one of the Detective's face-down informants face up." },
      { id: 'witness', name: 'Witness', text: 'No ability of its own. Witnesses are played as Evidence, three at once.' },
    ],
  },
};

// The same city with one place the subway map has no spot for.
