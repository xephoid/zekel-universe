// Cybernoir 2127 glue: a map of the city's locations in three boroughs, two
// very different tableaux (Detective case board, Hacker contacts), the
// evidence row, the jail track and the clue tokens. View shape per the
// engine (zekel src/games/cybernoir-2127/views.ts). The locations and their
// boroughs come from the engine's reference data; the map lays each borough
// out as a band and spreads its locations across it.

import type { CardData, MapNode, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, GlueInput, LegalMove, MoveForm, PlanPrompt, PromptAction, SelectEvent, SetupField, TablePlan, Zone, SetupAnswers, SetupSeat } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';

/**
 * The game's own colours, from the design canvas (docs/design/Cybernoir
 * Hacker Table.dc.html and Big Hands). Affiliation is the code that matters:
 * it is the field a Motive set is built from and what a big hand folds on, so
 * every person and every location wears their faction's colour rather than
 * the seat that happens to hold them.
 */
const PALETTE: Record<string, string> = {
  // The six factions, keyed by the engine's own ids.
  none: '#575b61',
  corp_1: '#1c2a5e',
  corp_2: '#0b6155',
  gang_1: '#1f6e8c',
  gang_2: '#7a1220',
  gang_3: '#5a3d8a',
  // The two seats, for panels and owner accents.
  detective: '#b3222a',
  hacker: '#1f6e8c',
  // States and the case file's three kinds of Evidence.
  played: '#3b3f46',
  safehouse: '#c9a227',
  out_of_reach: '#8a8578',
  evidence: '#3E7C4F',
  witness: '#1f6e8c',
  motive: '#b3222a',
  weapon: '#c9a227',
  not: '#8a8578',
};

interface Loc { name: string; borough: string; population?: number; affiliation?: string }

function locations(reference: GameReferenceResponse | null, view: Record<string, unknown>): Loc[] {
  const rd = reference?.referenceData;
  const out: Loc[] = [];
  if (isObj(rd) && Array.isArray(rd['locations'])) {
    for (const l of rd['locations']) {
      if (isObj(l) && typeof l['name'] === 'string') {
        out.push({
          name: l['name'],
          borough: asStr(l['borough'], 'city'),
          population: typeof l['population'] === 'number' ? l['population'] : undefined,
          affiliation: asStr(l['affiliation']) || undefined,
        });
      } else if (typeof l === 'string') {
        out.push({ name: l, borough: 'city' });
      }
    }
  }
  if (out.length > 0) return out;
  // Without reference data, at least show what the view names.
  const names = new Set<string>();
  for (const b of asArr(view['board'])) names.add(asStr(b));
  const det = isObj(view['detective']) ? view['detective'] : {};
  for (const d of asArr(det['location_discard'])) names.add(asStr(d));
  for (const h of asArr(view['location_hand'])) names.add(asStr(h));
  return [...names].filter(Boolean).map((name) => ({ name, borough: 'city' }));
}

/** One of the game's people, as the engine's reference data prints them. */
interface Person { name: string; affiliation?: string; home?: string; cost?: number; ability?: string; isWitness: boolean }

function peopleByName(reference: GameReferenceResponse | null): Map<string, Person> {
  const rd = reference?.referenceData;
  const out = new Map<string, Person>();
  if (!isObj(rd) || !Array.isArray(rd['people'])) return out;
  for (const p of rd['people']) {
    if (!isObj(p) || typeof p['name'] !== 'string') continue;
    out.set(p['name'], {
      name: p['name'],
      affiliation: asStr(p['affiliation']) || undefined,
      home: asStr(p['home_location']) || undefined,
      cost: typeof p['cost'] === 'number' ? p['cost'] : undefined,
      ability: asStr(p['ability']) || undefined,
      isWitness: p['is_witness'] === true,
    });
  }
  return out;
}

/**
 * A Contact as a card that carries its own decision: what it costs against
 * three action points, the field a Motive set is built from, and what playing
 * it does. The ability is the engine's own id put into words — the engine
 * publishes no sentence for it, and Universe does not write one.
 */
function contactCard(id: string, label: string, people: Map<string, Person>, n: Names): CardData {
  const p = people.get(label);
  if (!p) return { id, label, colorKey: 'none' };
  const badges = [
    ...(p.affiliation && p.affiliation !== 'none' ? [n.affiliation(p.affiliation)] : []),
    ...(p.isWitness ? ['Witness'] : []),
  ];
  return {
    id, label, colorKey: p.affiliation || 'none',
    // A big hand folds by faction: the field a Motive set is built from.
    ...(p.affiliation ? { groupKey: p.affiliation } : {}),
    ...(p.cost === undefined ? {} : { cost: p.cost }),
    ...(p.ability && p.ability !== 'witness' ? { subtitle: words(p.ability) } : {}),
    ...(badges.length > 0 ? { badges } : {}),
  };
}

/** A Location as a card: its three printed facts, and who lives there —
 *  residents are what playing it puts in the Detective's reach. */
function locationCard(id: string, label: string, locs: Loc[], reference: GameReferenceResponse | null, n: Names): CardData {
  const l = locs.find((x) => x.name === label);
  if (!l) return { id, label, colorKey: 'none' };
  const who = residentsOf(reference, l.name);
  return {
    id, label, colorKey: l.affiliation || 'none',
    // A big hand of Locations folds by borough.
    groupKey: l.borough,
    ...(who.length > 0 ? { subtitle: who.join(', ') } : {}),
    badges: [
      n.borough(l.borough),
      residentCount(l.population),
      ...(l.affiliation && l.affiliation !== 'none' ? [n.affiliation(l.affiliation)] : []),
    ].filter(Boolean),
  };
}

/** The locations a move names, however it names them. */
function namedLocations(m: LegalMove): string[] {
  const out: string[] = [];
  for (const key of ['location_name', 'target_location', 'new_location_name']) {
    const v = asStr(m.move[key]);
    if (v) out.push(v);
  }
  for (const v of asArr(m.move['discard_locations'])) {
    const name = asStr(v);
    if (name) out.push(name);
  }
  return out;
}

/** The people a move names, however it names them. */
function namedPeople(m: LegalMove): string[] {
  const out: string[] = [];
  for (const key of ['person_name', 'target_person']) {
    const v = asStr(m.move[key]);
    if (v) out.push(v);
  }
  for (const v of asArr(m.move['people'])) {
    const name = asStr(v);
    if (name) out.push(name);
  }
  return out;
}

export function personId(name: string): string {
  return `cn:person:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Who the Detective can reach: everyone living at a Location they have
 * played. Twelve of their legal moves target a person, and people were drawn
 * nowhere, so those moves had nothing to touch.
 *
 * A person already spoken for is drawn unlit, with where they are — a public
 * fact, or one this seat is entitled to. Why that puts them out of reach is a
 * rule, and the engine says it by not listing the move.
 */
function whoYouCanReach(
  view: Record<string, unknown>,
  reference: GameReferenceResponse | null,
  people: Map<string, Person>,
  n: Names,
): Zone {
  const played = asArr(view['board']).map((b) => asStr(b));
  const here: string[] = [];
  for (const loc of played) for (const who of residentsOf(reference, loc)) if (!here.includes(who)) here.push(who);

  const where = new Map<string, string>();
  const jail = isObj(view['jail']) ? view['jail'] : {};
  for (const [key, label] of [['slot_1_booked', 'booked'], ['slot_2_processing', 'processing'], ['slot_3_release_pending_then_freed', 'release pending']] as const) {
    for (const who of asArr(jail[key])) where.set(asStr(who), `in jail · ${label}`);
  }
  const evidence = isObj(view['evidence']) ? view['evidence'] : {};
  for (const key of Object.keys(evidence)) {
    if (key === 'weapon') continue;
    for (const who of asArr(evidence[key])) where.set(asStr(who), 'played as Evidence');
  }
  for (const inf of asArr(view['informants'])) {
    const o = isObj(inf) ? inf : {};
    where.set(asStr(o['person']), o['revealed'] ? 'your informant, revealed' : 'your informant');
  }

  return {
    kind: 'card-zone', id: 'cn:reach',
    data: {
      label: here.length > 0 ? `Who you can reach (${here.length})` : 'Who you can reach',
      mode: 'row', size: 'small',
      cards: here.map((who) => {
        // Not the Contact's play cost: that is what the HACKER pays for them.
        // What reaching them costs the Detective is in the engine's own words,
        // on the moves the tap offers.
        const { cost: _hackersPrice, ...card } = contactCard(personId(who), who, people, n);
        const at = where.get(who);
        return { ...card, ...(at ? { colorKey: 'out_of_reach', subtitle: at } : {}) };
      }),
    },
  };
}

/** The people the engine's reference data puts at a location, by printed name. */
function residentsOf(reference: GameReferenceResponse | null, locName: string): string[] {
  const rd = reference?.referenceData;
  if (!isObj(rd) || !Array.isArray(rd['people'])) return [];
  return rd['people'].filter(isObj)
    .filter((p) => asStr(p['home_location']) === locName)
    .map((p) => asStr(p['name']))
    .filter(Boolean);
}

/**
 * The printed names behind the engine's ids. `gang_1` is Iceden Collective,
 * not "Gang 1" — that is one of its aliases, and title-casing the id only
 * looked right by accident. Every name on the table comes from the game's own
 * reference data; an id the data does not carry is shown in words rather than
 * raw, and never guessed at.
 */
interface Names { affiliation(id: string): string; borough(id: string): string }

function names(reference: GameReferenceResponse | null): Names {
  const rd = reference?.referenceData;
  const table = (key: string): Map<string, string> => {
    const out = new Map<string, string>();
    const rows = isObj(rd) && Array.isArray(rd[key]) ? rd[key] : [];
    for (const r of rows) {
      if (isObj(r) && typeof r['id'] === 'string' && typeof r['name'] === 'string') out.set(r['id'], r['name']);
    }
    return out;
  };
  const affiliations = table('affiliations');
  const boroughs = table('boroughs');
  return {
    affiliation: (id) => affiliations.get(id) ?? words(id),
    borough: (id) => boroughs.get(id) ?? words(id),
  };
}

/** How many people live at a location, in words. */
function residentCount(population: number | undefined): string {
  return typeof population === 'number' ? `${population} resident${population === 1 ? '' : 's'}` : '';
}

/**
 * The turn's verbs, in the order the printed turn sheet has them. A verb is
 * drawn only when the engine lists a move behind it, and a verb that several
 * moves stand behind asks which, in the engine's own words.
 *
 * The label is the verb; the engine's own sentence is the button's title and
 * the chooser's row, so the two-hundred-character paragraph about burning the
 * safehouse never becomes a button label. Where the engine states a cost it
 * states it in that sentence — "Play Blackice (2 AP)" — and a verb with one
 * move behind it carries that sentence as its note. A cost per verb would
 * need the engine to publish one; it does not, and Universe will not invent
 * one.
 */
const VERBS: Array<{ id: string; label: string; types: string[]; primary?: boolean }> = [
  // The Detective's turn.
  { id: 'play-location', label: 'Play a Location', types: ['play_location'], primary: true },
  { id: 'upkeep', label: 'Pay upkeep', types: ['upkeep_choice'], primary: true },
  { id: 'arrest', label: 'Arrest', types: ['arrest'] },
  { id: 'recruit', label: 'Recruit an informant', types: ['recruit_informant'] },
  { id: 'buy-clue', label: 'Buy a clue', types: ['buy_clue'] },
  { id: 'draw-location', label: 'Draw a Location', types: ['draw_extra_location'] },
  { id: 'guess', label: 'Guess the hideout', types: ['guess_location', 'final_guess'] },
  // The Hacker's turn.
  { id: 'evidence', label: 'Play Evidence', types: ['play_evidence'], primary: true },
  { id: 'person', label: 'Play a person', types: ['play_person'] },
  { id: 'win-back', label: 'Win back a Contact', types: ['win_back'] },
  { id: 'draw-contact', label: 'Draw a Contact', types: ['draw_contact'] },
  { id: 'jailbreak', label: 'Jailbreak', types: ['jailbreak'] },
  { id: 'reveal', label: 'Reveal an informant', types: ['reveal_informant'] },
  { id: 'overclock', label: 'Overclock', types: ['overclock'] },
  { id: 'burn', label: 'Burn the safehouse', types: ['burn_safehouse'] },
  // Both.
  { id: 'end-turn', label: 'End turn', types: ['pass_turn'] },
];

/**
 * A moment that stops the turn and asks one question: the Detective deciding
 * whether to block, and the Hacker choosing which clue that block buys. Both
 * doors are drawn with what each costs, in the engine's own words, with
 * nothing preselected and no clock. Declining is a button like any other and
 * says nothing afterwards.
 */
function interruptPrompt(pending: string, legalMoves: LegalMove[]): PlanPrompt | null {
  const decide = legalMoves.filter((m) => m.move['type'] === 'block_decide');
  if (decide.length > 0) {
    return {
      title: 'Block this play?',
      sub: 'Revealing an informant stops the card and buys you a clue; the informant stays face up from then on. Letting it through costs you nothing and tells them nothing.',
      urgent: true,
      actions: decide.map((m) => ({
        id: `cn:block:${m.move['block'] === true ? 'yes' : 'no'}`,
        label: m.move['block'] === true ? 'Block it' : 'Let it through',
        title: m.description,
        ...(m.move['block'] === true ? { primary: true } : {}),
        move: m,
      })),
    };
  }
  const clue = legalMoves.filter((m) => m.move['type'] === 'clue_reveal');
  if (clue.length > 0) {
    return {
      title: 'Which clue do you give?',
      sub: 'The block bought them one true fact about where you are hiding. You choose which, and it stays on the table for the rest of the game.',
      urgent: true,
      actions: clue.map((m) => ({
        id: `cn:clue:${asStr(m.move['category'])}`,
        label: words(asStr(m.move['category'])),
        title: m.description,
        move: m,
      })),
    };
  }
  // A pending step this glue has no words for keeps the numbered list.
  void pending;
  return null;
}

/**
 * The verbs the engine is offering this seat right now.
 *
 * A move type no verb above claims still gets a button, labelled with the
 * engine's own word for it. The turn's follow-up questions — which Location
 * to discard, which informant to flip, what to take back — are move types of
 * their own, and without this the bar was empty at exactly the moment the
 * engine was waiting on an answer.
 */
function verbActions(legalMoves: LegalMove[]): PromptAction[] {
  const out: PromptAction[] = [];
  const claimed = new Set<string>();
  for (const v of VERBS) {
    const moves = legalMoves.filter((m) => v.types.includes(asStr(m.move['type'])));
    if (moves.length === 0) continue;
    for (const t of v.types) claimed.add(t);
    const only = moves.length === 1 ? moves[0]! : null;
    out.push({
      id: `cn:verb:${v.id}`,
      label: v.label,
      note: only ? undefined : `${moves.length} to choose from`,
      title: only ? only.description : undefined,
      ...(v.primary ? { primary: true } : {}),
      moves,
    });
  }
  const leftover = [...new Set(legalMoves.map((m) => asStr(m.move['type'])).filter((t) => t && !claimed.has(t)))];
  for (const t of leftover) {
    const moves = legalMoves.filter((m) => asStr(m.move['type']) === t);
    const only = moves.length === 1 ? moves[0]! : null;
    out.push({
      id: `cn:verb:${t}`,
      label: words(t.replace(/_choice$/, '')),
      note: only ? undefined : `${moves.length} to choose from`,
      title: only ? only.description : undefined,
      primary: true,
      moves,
    });
  }
  return out;
}

/** The three facts a clue can name, in the order the printed case board has. */
const CLUE_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'borough', label: 'Borough' },
  { key: 'population', label: 'Population' },
  { key: 'affiliation', label: 'Affiliation' },
];

/**
 * A clue token's value in the game's own words. The engine publishes a
 * truthful value as the bare fact and a ruled-out one as a token id like
 * `affiliation_gang_1`, so the id is split on its category and the rest read
 * through the same printed names the map uses.
 */
function clueValue(category: string, value: unknown, n: Names): string {
  if (category === 'borough') return n.borough(asStr(value));
  if (category === 'affiliation') return n.affiliation(asStr(value));
  // Population is the bare number: the slot it sits in already says what it
  // counts, and a NOT token reads "Population 0".
  return typeof value === 'number' ? String(value) : asStr(value);
}

/** A negative token id (`population_0`) as its category and printed value. */
function negativeClue(tokenId: string, n: Names): { category: string; value: string } | null {
  const cat = CLUE_CATEGORIES.find((c) => tokenId.startsWith(`${c.key}_`));
  if (!cat) return null;
  return { category: cat.label, value: clueValue(cat.key, tokenId.slice(cat.key.length + 1), n) };
}

/**
 * The case file: the thirteen cards that win the game, in the shape the
 * printed sheet has them — the Weapon, a row of Witnesses, and a row per
 * Motive set. Empty slots are drawn as outlines so the shape of the win is
 * visible from turn one.
 *
 * The row sizes come from the engine's `reference_data.evidence`, never from
 * a count here: how many cards win is a rule. An engine that does not publish
 * the shape gets the played cards and no outlines.
 */
function evidenceCase(
  view: Record<string, unknown>,
  reference: GameReferenceResponse | null,
  role: string,
  people: Map<string, Person>,
  n: Names,
): Zone {
  const evidence = isObj(view['evidence']) ? view['evidence'] : {};
  /**
   * Evidence is face up for good, and what is printed on it is the
   * Detective's to read: where each person lives is what narrows the
   * nineteen locations down, and their faction is what a Motive set is made
   * of. The ability is not shown — a card played as Evidence never used one.
   */
  const card = (id: string, label: string, fallbackColor: string): CardData => {
    const p = people.get(label);
    if (!p) return { id, label, colorKey: fallbackColor };
    const badges = [
      ...(p.affiliation && p.affiliation !== 'none' ? [n.affiliation(p.affiliation)] : []),
      ...(p.isWitness ? ['Witness'] : []),
    ];
    return {
      id, label,
      colorKey: p.affiliation || 'none',
      ...(p.home ? { subtitle: `at ${p.home}` } : {}),
      ...(p.cost === undefined ? {} : { cost: p.cost }),
      ...(badges.length > 0 ? { badges } : {}),
    };
  };
  const rd = reference?.referenceData;
  const shape = isObj(rd) && isObj(rd['evidence']) ? rd['evidence'] : null;
  const size = (key: string): number | undefined => {
    const v = shape?.[key];
    return typeof v === 'number' ? v : undefined;
  };
  const motiveSets = size('motive_sets');
  const setSize = size('motive_set_size');

  const rows: Zone[] = [];
  const row = (id: string, label: string, cards: CardData[], slots: number | undefined): void => {
    rows.push({
      kind: 'card-zone', id,
      data: {
        label, mode: 'row', size: 'small', cards,
        empty: slots === undefined ? undefined : Math.max(0, slots - cards.length),
      },
      arriveFrom: role === 'hacker' ? 'cn:hand' : undefined,
    });
  };

  row('cn:case:weapon', 'Weapon',
    evidence['weapon'] ? [{ id: 'cn:ev:weapon', label: 'The Weapon', colorKey: 'weapon' }] : [],
    size('weapon'));

  row('cn:case:witnesses', 'Witnesses',
    asArr(evidence['witnesses']).map((w) => card(`cn:ev:witness:${asStr(w)}`, asStr(w), 'witness')),
    size('witnesses'));

  // The motive rows the engine names, in order. `motive_set_4` is in the view
  // for old sessions and is drawn only if something is actually in it.
  const motiveKeys = Object.keys(evidence).filter((k) => k.startsWith('motive_set_')).sort();
  motiveKeys.forEach((key, i) => {
    const cards = asArr(evidence[key]).map((m) => card(`cn:ev:${key}:${asStr(m)}`, asStr(m), 'motive'));
    const expected = motiveSets === undefined || i < motiveSets;
    if (!expected && cards.length === 0) return;
    row(`cn:case:${key}`, `Motive ${ORDINALS[i] ? words(ORDINALS[i]) : String(i + 1)}`, cards, expected ? setSize : undefined);
  });

  const played = rows.reduce((n, z) => n + ((z.data as { cards?: unknown[] }).cards?.length ?? 0), 0);
  const total = size('total');
  return {
    kind: 'tableau', id: 'cn:case',
    data: {
      label: role === 'hacker' ? 'Your case' : "The Hacker's case",
      owner: role === 'hacker' ? 'hacker' : 'evidence',
      stats: [{ label: 'Evidence', value: played, ...(total === undefined ? {} : { max: total }) }],
    },
    children: rows,
  };
}

/** One line of a location's three printed facts, for a hint under its name. */
function locLine(l: Loc, n: Names): string {
  return [
    n.borough(l.borough),
    residentCount(l.population),
    l.affiliation && l.affiliation !== 'none' ? n.affiliation(l.affiliation) : 'no affiliation',
  ].filter(Boolean).join(' · ');
}

/**
 * The setup move the Hacker completes with a location name, when the engine
 * lists it. An AI Hacker's template carries no `location_name` at all (the
 * engine picks that one secretly), so it never matches here.
 */
function hideoutTemplate(legalMoves: LegalMove[]): LegalMove | null {
  return legalMoves.find((m) => m.move['type'] === 'report_hideout' && m.move['location_name'] === '') ?? null;
}

/** Where a tap on the map during setup is kept until the sheet names it back. */
const TAPPED_HIDEOUT = 'cn:tapped-hideout';

export function locId(name: string): string {
  return `cn:loc:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export const cybernoirGlue: GlueModule = {
  gameId: 'cybernoir-2127',
  title: 'Cybernoir 2127',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'phase', 'board', 'detective', 'hacker')) return null;
    const role = asStr(view['role'], '');
    const played = new Set(asArr(view['board']).map((b) => asStr(b)));
    // The Hacker's own view names their hideout beside the three printed
    // facts. An older view gave only the facts, which mark no single node
    // (Trailer Towers and Little Ghana share all three), and a session from
    // before the engine stored the location id names nothing; either way the
    // mark stays off rather than landing on a guess.
    const hideoutRaw = view['hideout'];
    const hideoutDesc = isObj(hideoutRaw) ? hideoutRaw : null;
    const hideout = hideoutDesc ? asStr(hideoutDesc['location_name'], '') : asStr(hideoutRaw, '');

    const name = names(input.reference);
    const people = peopleByName(input.reference);
    // The city is a map: nineteen named regions grouped in three borough
    // areas, no edges and no routes (cybernoir-2127.md, and the component
    // sheet, which says so in as many words). A region is a place rather
    // than a space, so it is drawn as a pill wide enough to hold its name.
    //
    // Each of the three facts a clue can name is said once and in the place
    // that fits it: the borough is the band the region stands in, the faction
    // is the region's colour, and how many people live there is its one
    // badge. They used to be three text badges each, which is what made the
    // map unreadable.
    const locs = locations(input.reference, view);
    const boroughs = [...new Set(locs.map((l) => l.borough))];
    const bandHeight = 100 / Math.max(1, boroughs.length);
    const nodes: MapNode[] = [];
    boroughs.forEach((b, bi) => {
      const inBand = locs.filter((l) => l.borough === b);
      const yTop = bi * bandHeight;
      inBand.forEach((l, i) => {
        const cols = Math.ceil(inBand.length / 2);
        const row = i % 2;
        const col = Math.floor(i / 2);
        const isPlayed = played.has(l.name);
        const isHideout = role === 'hacker' && hideout === l.name;
        nodes.push({
          id: locId(l.name),
          label: l.name,
          area: b,
          x: 16 + (cols <= 1 ? 34 : (col / (cols - 1)) * 68),
          y: yTop + bandHeight * 0.36 + row * bandHeight * 0.34,
          colorKey: isPlayed ? 'played' : (l.affiliation || 'none'),
          badges: [
            ...(isPlayed ? ['played'] : []),
            ...(isHideout ? ['safehouse'] : []),
            residentCount(l.population),
          ].filter(Boolean),
          pieces: isHideout ? [{ label: 'safehouse', colorKey: 'safehouse' }] : [],
        });
      });
    });

    const board: Zone[] = [
      {
        kind: 'map', id: 'cn:map',
        data: {
          label: `The city · ${locs.length} locations · ${played.size} played`,
          aspect: 52, nodeShape: 'pill', nodes,
          areas: boroughs.map((b, bi) => ({
            key: b,
            label: name.borough(b),
            note: `${locs.filter((l) => l.borough === b).length} locations`,
            y: bi * bandHeight,
            height: bandHeight,
          })),
        },
      },
    ];

    // Jail: three named slots with whoever sits in them.
    const jail = isObj(view['jail']) ? view['jail'] : {};
    const slots: Array<[string, string]> = [
      ['slot_1_booked', 'Booked'], ['slot_2_processing', 'Processing'], ['slot_3_release_pending_then_freed', 'Release pending'],
    ];
    // Three slots in a line with arrows between them, each holding a stack of
    // face-up cards. Who is in them is the whole point, so they are named.
    const jailed = slots.reduce((n, [key]) => n + asArr(jail[key]).length, 0);
    board.push({
      kind: 'track', id: 'cn:jail',
      data: {
        label: jailed > 0 ? `Jail · ${jailed} held` : 'Jail · nobody held',
        pieceShape: 'named', arrows: true,
        spaces: slots.map(([key, label]) => ({
          index: label,
          filled: asArr(jail[key]).length > 0,
          pieces: asArr(jail[key]).map((who) => ({
            label: asStr(who),
            colorKey: people.get(asStr(who))?.affiliation || 'none',
          })),
        })),
      },
    });

    const caseFile = evidenceCase(view, input.reference, role, people, name);

    // The clue rail: what the Detective knows. Three truthful slots, one per
    // category, each holding its revealed value or drawn empty, and the ruled
    // out tokens beside them. Public, and the same for both seats — the
    // deduction the whole game turns on, which the table used to say nothing
    // about beyond "NOT ×4".
    const revealed = isObj(view['truthful_clues']) ? view['truthful_clues'] : {};
    const values = isObj(view['truthful_values']) ? view['truthful_values'] : {};
    board.push({
      kind: 'track', id: 'cn:clues', span: 'full',
      data: {
        label: 'What the Detective knows',
        spaces: CLUE_CATEGORIES.map((c) => ({
          index: c.label,
          label: revealed[c.key] ? clueValue(c.key, values[c.key], name) : undefined,
          filled: !!revealed[c.key],
        })),
      },
    });

    const ruledOut = asArr(view['negative_clues'])
      .map((t) => negativeClue(asStr(t), name))
      .filter((x): x is { category: string; value: string } => x !== null);
    board.push({
      kind: 'pool', id: 'cn:not-clues', span: 'full',
      data: {
        label: ruledOut.length > 0 ? `Ruled out (${ruledOut.length})` : 'Ruled out — nothing yet',
        items: ruledOut.map((r) => ({ label: `${r.category} ${r.value}`, count: 1, colorKey: 'not' })),
      },
    });

    const det = isObj(view['detective']) ? view['detective'] : {};
    const hak = isObj(view['hacker']) ? view['hacker'] : {};
    const activeRole = asStr(view['activePlayerId']);
    const detStats: NonNullable<TableauData['stats']> = [
      { label: 'Action points', value: asNum(det['ap']) },
      { label: 'Location deck', value: asNum(det['location_deck_size']) },
      { label: 'Location hand', value: asNum(det['location_hand_size']) },
      { label: 'Person deck', value: asNum(det['poi_deck_size']) },
      { label: 'Mid-game guess', value: det['mid_game_guess_spent'] ? 'spent' : 'available' },
      { label: 'Overclock', value: det['overclock_used'] ? 'used' : 'available' },
    ];
    const hakStats: NonNullable<TableauData['stats']> = [
      { label: 'Action points', value: asNum(hak['ap']) },
      // Named when the engine names it; otherwise the facts the Hacker does have.
      ...(role === 'hacker' && (hideout || hideoutDesc)
        ? [{ label: 'Safehouse', value: hideout
          || [name.borough(asStr(hideoutDesc!['borough'])), asStr(hideoutDesc!['affiliation']) && asStr(hideoutDesc!['affiliation']) !== 'none' ? name.affiliation(asStr(hideoutDesc!['affiliation'])) : ''].filter(Boolean).join(' · ')
          || 'hidden' }]
        : []),
      // Block risk is the Hacker's central risk, and their view carries the
      // count (never the names). It said nothing about it before.
      { label: 'Informants facing you', value: asNum(view['informants_facedown_count']) },
      { label: 'Contacts deck', value: asNum(hak['contacts_deck_size']) },
      { label: 'Hand', value: asNum(hak['hand_size']) },
      { label: 'Safehouse burned', value: view['safehouse_burned'] ? 'yes' : 'no' },
      { label: 'Overclock', value: hak['overclock_used'] ? 'used' : 'available' },
    ];
    const detTz: Zone = { kind: 'tableau', id: 'cn:detective', data: { label: `Detective${role === 'detective' ? ' (you)' : ''}`, owner: 'detective', active: /det/i.test(activeRole), stats: detStats } };
    const hakTz: Zone = { kind: 'tableau', id: 'cn:hacker', data: { label: `Hacker${role === 'hacker' ? ' (you)' : ''}`, owner: 'hacker', active: /hak|hack/i.test(activeRole), stats: hakStats } };

    const bench: Zone[] = [];
    const side: Zone[] = [];
    if (role === 'detective') {
      bench.push(detTz);
      side.push(hakTz);
      const hand = view['location_hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', id: 'cn:hand', arriveFrom: 'cn:location-deck',
          data: {
            label: 'Your location hand', mode: 'fan',
            groupNames: Object.fromEntries(boroughs.map((b) => [b, name.borough(b)])),
            cards: hand.map((h, i) => locationCard(`cn:hand:${i}:${asStr(h)}`, asStr(h), locs, input.reference, name)),
          },
        });
      }
      const informants = asArr(view['informants']);
      bench.push({
        kind: 'card-zone', id: 'cn:informants',
        data: {
          label: 'Informants', mode: 'row',
          // Face up for their owner, who pays to hold them and is the one
          // person entitled to know. The line underneath says whether the
          // Hacker has seen it — the card is not public either way.
          cards: informants.map((inf, i) => {
            const o = isObj(inf) ? inf : {};
            const revealed = !!o['revealed'];
            return {
              ...contactCard(`cn:informant:${ORDINALS[i] ?? String(i)}`, asStr(o['person']), people, name),
              subtitle: revealed ? 'revealed to the Hacker' : 'face down to the Hacker',
            };
          }),
        },
      });
      side.push(whoYouCanReach(view, input.reference, people, name));
      side.push({ kind: 'card-zone', id: 'cn:location-deck', data: { label: 'Location deck', mode: 'pile', countOnly: asNum(det['location_deck_size']) } });
    } else {
      bench.push(hakTz);
      side.push(detTz);
      const hand = view['hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', id: 'cn:hand', arriveFrom: 'cn:contacts-deck',
          data: {
            label: 'Your contacts', mode: 'fan',
            groupNames: Object.fromEntries([...new Set([...people.values()].map((p) => p.affiliation).filter(Boolean))]
              .map((a) => [a as string, name.affiliation(a as string)])),
            cards: hand.map((h, i) => contactCard(`cn:hand:${i}:${asStr(h)}`, asStr(h), people, name)),
          },
        });
      }
      side.push({ kind: 'card-zone', id: 'cn:contacts-deck', data: { label: 'Contacts deck', mode: 'pile', countOnly: asNum(hak['contacts_deck_size']) } });
    }

    // A moment that stops the turn and asks one question comes before the
    // turn's own verbs.
    const interrupt = interruptPrompt(asStr(view['pending']), input.legalMoves);
    // Setup is the Hacker's one secret decision: they name the hideout and
    // hide there all game. The map is how they say it; the Detective waits.
    const choosing = asStr(view['phase']) === 'setup' ? hideoutTemplate(input.legalMoves) : null;
    let prompt: PlanPrompt | undefined;
    if (choosing) {
      prompt = {
        title: 'Choose your hideout',
        sub: `Tap a location on the map — ${locs.length} to choose from. You hide there all game, the people who live there start in your hand, and the Detective wins by naming it.`,
        actions: [],
      };
    } else if (asStr(view['phase']) === 'setup') {
      prompt = { title: 'The Hacker is choosing a hideout', sub: 'The city opens once they have hidden.', actions: [] };
    } else if (interrupt) {
      prompt = interrupt;
    } else {
      // The turn's verbs. The numbered list stays, one tap away, and is no
      // longer the only way to act.
      const actions = verbActions(input.legalMoves);
      if (actions.length > 0) {
        const ap = asNum((role === 'detective' ? det : hak)['ap']);
        prompt = {
          title: role === 'detective' ? "Detective's turn" : "Hacker's turn",
          sub: `${ap} action point${ap === 1 ? '' : 's'} left. Unspent points are lost at the end of the turn.`,
          actions,
        };
      }
    }

    const status = `Turn ${asNum(view['turn'], 1)} · ${words(asStr(view['phase']))}`;
    return { board, bench, side, points: caseFile, palette: PALETTE, title: 'Cybernoir 2127', status, prompt };
  },

  litParts(input: GlueInput): string[] {
    // Setup: every location in the city is a place the Hacker may hide.
    if (hideoutTemplate(input.legalMoves)) {
      return locations(input.reference, isObj(input.view) ? input.view : {}).map((l) => locId(l.name));
    }
    const lit: string[] = [];
    const hand = shapeHas(input.view, 'role') ? asArr(input.view['location_hand'] ?? input.view['hand']) : [];
    // A card in hand is named, not indexed — by a person for the Hacker, by a
    // location for the Detective. Every move that names one lights the card
    // holding it, so a playable card can be tapped where it is rather than
    // only wherever else it happens to appear.
    const inHand = (what: string): string | null => {
      const i = hand.findIndex((h) => asStr(h) === what);
      return i < 0 ? null : `cn:hand:${i}:${what}`;
    };
    for (const m of input.legalMoves) {
      const t = asStr(m.move['type']);
      for (const what of [...namedPeople(m), ...namedLocations(m)]) {
        const card = inHand(what);
        if (card) lit.push(card);
      }
      for (const loc of namedLocations(m)) lit.push(locId(loc));
      if (typeof m.move['hand_index'] === 'number') lit.push(`cn:hand:${m.move['hand_index']}:${asStr(hand[m.move['hand_index']])}`);
      const inf = asStr(m.move['target_informant']);
      if ((t === 'reveal_informant' || t === 'informant_removal_choice') && inf) lit.push(`cn:informant:${inf}`);
      const person = asStr(m.move['target_person']);
      if (person) lit.push(personId(person));
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const choosing = hideoutTemplate(input.legalMoves);
    if (choosing) {
      const l = locations(input.reference, isObj(input.view) ? input.view : {}).find((x) => locId(x.name) === sel.id);
      if (!l) return null;
      // The tap is the answer; the sheet names it back and the player presses
      // Hide here. Nothing is sent until they do.
      input.memory.set(TAPPED_HIDEOUT, l.name);
      return choosing;
    }
    const hand = shapeHas(input.view, 'role') ? asArr(input.view['location_hand'] ?? input.view['hand']) : [];
    return (
      input.legalMoves.find((m) => {
        const loc = asStr(m.move['location_name'] ?? m.move['target_location'] ?? m.move['new_location_name']);
        if (loc && locId(loc) === sel.id) return true;
        const h = /^cn:hand:(\d+):/.exec(sel.id);
        if (h && m.move['hand_index'] === Number(h[1]) && asStr(hand[Number(h[1])]) === sel.id.slice(h[0].length)) return true;
        const inf = /^cn:informant:(.+)$/.exec(sel.id);
        if (inf && m.move['target_informant'] === inf[1]) return true;
        return false;
      }) ?? null
    );
  },

  /**
   * Upkeep: each informant, kept or released, with nothing preselected. The
   * engine lists every combination as its own move, so the form finds the one
   * the answers make and sends that — and shows the engine's own sentence for
   * it, which is where the cost is stated. Universe does not add up what
   * holding them costs: that is a rule.
   */
  formFor(move: LegalMove, input: GlueInput): MoveForm | null {
    if (move.move['type'] === 'upkeep_choice') {
      const view = isObj(input.view) ? input.view : {};
      const informants = asArr(view['informants']).map((inf) => asStr(isObj(inf) ? inf['person'] : inf)).filter(Boolean);
      if (informants.length === 0) return null;
      const listed = input.legalMoves.filter((m) => m.move['type'] === 'upkeep_choice');
      const madeBy = (answers: Record<string, unknown>): { keep: string[]; release: string[] } | null => {
        const keep: string[] = [];
        const release: string[] = [];
        for (const who of informants) {
          const a = answers[`inf.${who}`];
          if (a === 'keep') keep.push(who);
          else if (a === 'release') release.push(who);
          else return null;
        }
        return { keep, release };
      };
      const same = (a: string[], b: unknown): boolean => {
        const other = asArr(b).map((x) => asStr(x));
        return a.length === other.length && a.every((x) => other.includes(x));
      };
      return {
        title: 'Pay upkeep',
        help: 'Every informant you keep costs you, and a released one goes back into the deck. Say what happens to each.',
        fields: informants.map((who) => ({
          kind: 'choice' as const, key: `inf.${who}`, label: who,
          options: [{ value: 'keep', label: 'Keep' }, { value: 'release', label: 'Release' }],
        })),
        template: move,
        editableKeys: ['keep', 'release'],
        submitLabel: 'Pay upkeep',
        build(answers) {
          const made = madeBy(answers);
          if (!made) return null;
          // Only ever a move the engine listed. With more informants than the
          // engine enumerates, it lists one blank to fill in instead.
          const exact = listed.find((m) => same(made.keep, m.move['keep']) && same(made.release, m.move['release']));
          if (exact) return exact.move;
          const blank = listed.find((m) => asArr(m.move['keep']).length === 0 && asArr(m.move['release']).length === 0);
          return blank ? { ...blank.move, keep: made.keep, release: made.release } : null;
        },
      };
    }

    // The hideout. The engine lists it as a blank to fill in, so it goes
    // through a sheet either way: a tap on the map gets that location named
    // back before it is sent, and the numbered menu gets the whole city as a
    // list. The tap is read once — a later press with no fresh tap asks the
    // whole question again rather than leaning on an old one.
    if (move.move['type'] !== 'report_hideout' || move.move['location_name'] !== '') return null;
    const locs = locations(input.reference, isObj(input.view) ? input.view : {});
    if (locs.length === 0) return null;
    const name = names(input.reference);
    const tapped = asStr(input.memory.get(TAPPED_HIDEOUT));
    input.memory.delete(TAPPED_HIDEOUT);
    const one = locs.find((l) => l.name === tapped);
    if (one) {
      const who = residentsOf(input.reference, one.name);
      return {
        title: `Hide in ${one.name}?`,
        help: `${locLine(one, name)}. ${who.length > 0
          ? `${who.join(', ')} live here and start in your hand.`
          : 'Nobody lives here, so you start on three drawn Contacts.'}`,
        fields: [],
        template: move,
        editableKeys: ['location_name'],
        submitLabel: 'Hide here',
        build: () => ({ ...move.move, location_name: one.name }),
      };
    }
    return {
      title: 'Choose your hideout',
      help: 'You hide here all game and never move unless you burn the safehouse. The Detective wins by naming it.',
      fields: [{
        kind: 'choice', key: 'location_name', label: 'Location',
        options: locs.map((l) => ({ value: l.name, label: l.name, hint: locLine(l, name) })),
      }],
      template: move,
      editableKeys: ['location_name'],
      submitLabel: 'Hide here',
      build(answers) {
        const v = answers['location_name'];
        if (typeof v !== 'string' || !locs.some((l) => l.name === v)) return null;
        return { ...move.move, location_name: v };
      },
    };
  },

  movesForSelect(sel: SelectEvent, input: GlueInput): LegalMove[] {
    const person = input.legalMoves.filter((m) => namedPeople(m).some((who) => personId(who) === sel.id));
    if (person.length > 0) return person;
    const inHand = /^cn:hand:\d+:(.+)$/.exec(sel.id);
    if (inHand) {
      const named = input.legalMoves.filter((m) =>
        namedPeople(m).includes(inHand[1]!) || namedLocations(m).includes(inHand[1]!));
      if (named.length > 0) return named;
    }
    const one = cybernoirGlue.moveForSelect(sel, input);
    return one ? [one] : [];
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  /**
   * Two setup choices, both session options the engine takes: which role
   * the host plays (the engine's `detective` option names the Detective's
   * player id; the other seat is the Hacker), and the one rules variant
   * (when Overclock grants the Detective two Location draws).
   */
  setupFields(reference: GameReferenceResponse, _seats?: SetupSeat[]): SetupField[] {
    const schema = reference.optionsSchema;
    const props = isObj(schema) && isObj(schema['properties']) ? schema['properties'] : {};
    const fields: SetupField[] = [];
    if (isObj(props['detective'])) {
      fields.push({
        kind: 'choice', key: 'role', label: 'Your role',
        help: 'The Detective goes first and hunts the leads; the Hacker hides the truth. The other seat takes the other role.',
        options: [
          { value: 'detective', label: 'Detective', hint: 'Chase leads across the city and name the hideout.' },
          { value: 'hacker', label: 'Hacker', hint: 'Keep your hideout hidden and clear your name.' },
        ],
      });
    }
    const timing = isObj(props['overclock_draw_timing']) ? props['overclock_draw_timing'] : null;
    const values = timing && Array.isArray(timing['enum']) ? timing['enum'].map((v) => String(v)) : [];
    if (values.length > 0) {
      fields.push({
        kind: 'choice', key: 'overclock_draw_timing', label: 'Overclock: when the Detective draws the two Locations',
        help: typeof timing?.['description'] === 'string' ? timing['description'] : undefined,
        options: values.map((v) => ({ value: v, label: words(v) })),
      });
    }
    return fields;
  },

  setupOptions(answers: SetupAnswers, seats: SetupSeat[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const role = answers['role'];
    const host = seats.find((s) => s.host);
    const other = seats.find((s) => !s.host);
    if ((role === 'detective' || role === 'hacker') && host && other) {
      // Universe names seats p1..pN by position; the Detective is the host's
      // seat or the other one.
      out['detective'] = `p${(role === 'detective' ? host : other).position + 1}`;
    }
    const v = answers['overclock_draw_timing'];
    if (typeof v === 'string' && v) out['overclock_draw_timing'] = v;
    return out;
  },

};

export default cybernoirGlue;
