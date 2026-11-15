// The games this Universe can draw: each game's glue module by engine game
// id. The rules a glue follows are @zekel/glue-kit; this file is only the
// list. Every game's screen lives with the game in zekel-games and is
// installed from npm as `@zekel/<game>/glue`: this is "the game packages
// installed". Nothing else in the app may import a game package; it reaches
// a game through here (tests/glue-boundary.test.ts).

import type { ComponentType } from 'react';
import type { GlueModule } from '@zekel/glue-kit';
import type { GameReferenceResponse } from '@zekel/wire-types';
import { adventurerOlympicsGlue } from '@zekel/adventurer-olympics/glue';
import { cybernoirGlue } from '@zekel/cybernoir-2127/glue';
import { fracturedFistGlue } from '@zekel/fractured-fist/glue';
import { nggGlue, NggRulebook, readRulebook as readNggRulebook } from '@zekel/neither-guts-nor-gears/glue';
import { sweetlandsGlue } from '@zekel/sweetlands-imperium/glue';
import { warbleWayGlue } from '@zekel/warble-way-galaxy/glue';
import { wordDebaucheeGlue } from '@zekel/word-debauchee/glue';

export const GLUES: Record<string, GlueModule> = {
  'fractured-fist': fracturedFistGlue,
  'warble-way-galaxy': warbleWayGlue,
  'sweetlands-imperium': sweetlandsGlue,
  'cybernoir-2127': cybernoirGlue,
  'neither-guts-nor-gears': nggGlue,
  'adventurer-olympics': adventurerOlympicsGlue,
  'word-debauchee': wordDebaucheeGlue,
};

export function glueFor(gameId: string): GlueModule | null {
  return GLUES[gameId] ?? null;
}

/**
 * A game's rulebook page: the rules laid out like a printed rulebook, drawn
 * from the reference data the rules page already fetches. `ready` is the
 * game's own reader saying the data holds a rulebook its page can draw (an
 * older games server sends none). A game with no entry here, or data that
 * isn't ready, shows the rules as plain text.
 */
export interface RulebookPage {
  Page: ComponentType<{ reference: GameReferenceResponse | null }>;
  ready: (reference: GameReferenceResponse | null) => boolean;
}

export const RULEBOOKS: Record<string, RulebookPage> = {
  'neither-guts-nor-gears': { Page: NggRulebook, ready: nggRulebookReady },
};

/**
 * Neither Guts nor Gears' reader (0.1.4) fills anything missing or broken
 * with a default (a tile with no coordinates sits at 0,0; a card with no
 * copies counts zero; a missing word is blank), so a partial catalogue would
 * draw as the full reference. The page is shown only when the raw data holds
 * every part it draws, each part whole: a wrong number is worse than the
 * plain text. This check reads the raw data, not the reader's output.
 *
 * Checking entries one by one cannot see a whole entry that went missing (a
 * tile, a hero). For that the game says how many each list holds:
 * `rulebook.counts`, written by the game from its own catalogues (zekel-games
 * main, after 0.1.4). Every list must hold exactly that many. Data with no
 * counts, from a games server older than that, shows the plain text. Once the
 * installed reader makes the same checks itself (it does on zekel-games main),
 * this function can shrink to `readNggRulebook(raw) !== null`.
 */
function nggRulebookReady(reference: GameReferenceResponse | null): boolean {
  const raw = reference?.referenceData;
  try {
    return readNggRulebook(raw) !== null && nggDataWhole(raw);
  } catch {
    return false;
  }
}

type Check = (x: unknown) => boolean;
const obj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str: Check = (x) => typeof x === 'string' && x.trim().length > 0;
const num: Check = (x) => typeof x === 'number' && Number.isFinite(x);
const pos: Check = (x) => num(x) && (x as number) > 0;
const bool: Check = (x) => typeof x === 'boolean';
const count: Check = (x) => Number.isInteger(x) && (x as number) > 0;
/** A nonempty list, every entry passing. */
const list = (each: Check): Check => (x) => Array.isArray(x) && x.length > 0 && x.every(each);
/** An object holding every named field, each passing. */
const shape = (fields: Record<string, Check>): Check => (x) => obj(x) && Object.entries(fields).every(([k, f]) => f(x[k]));
const NGG_LAYOUTS = ['2p', '3-4p', '5-6p'] as const;
const byLayout = (each: Check): Check => shape(Object.fromEntries(NGG_LAYOUTS.map((k) => [k, each])));
const either = (...fs: Check[]): Check => (x) => fs.some((f) => f(x));
/** Exactly `n` entries, every one passing: the list arrived whole. */
const whole = (x: unknown, n: number, each: Check) => Array.isArray(x) && x.length === n && x.every(each);

const pieces = list(shape({ icon: str, count: pos, name: str }));
const faction = shape({ faction: str, factions: str, pieces, note: str });
const figure = shape({
  tiles: list(shape({ c: num, r: num, resource: str, label: str })),
  pieces: list(shape({ c: num, r: num, faction: str, icon: str, name: str, placed: bool })),
  caption: str,
});
/** Every section of the rulebook's words the page draws. */
const rulebookText = shape({
  title: str, intro: str, facts: list(str),
  players_by_layout: byLayout(list(pos)),
  victory: shape({ intro: str, military: str, cultural: str, economic: str, technological: str, economic_mix: (x) => obj(x) && Object.keys(x).length > 0 && Object.values(x).every(pos) }),
  components: list(shape({ icon: str, name: str, count: either(pos, byLayout(pos)), text: either(str, byLayout(str)) })),
  map: shape({ intro: str }),
  setup: shape({ steps: list(str), wizard: faction, robot: faction }),
  round: shape({
    steps: list(shape({ icon: str, name: str, text: str })), note: str,
    stack: shape({ title: str, intro: str, steps: list(str), cards: list(shape({ faction: str, action: str, placed: str })) }),
    milestones: shape({ intro: str }),
  }),
  paying: shape({ title: str, intro: str, example: shape({ title: str, buys: str, steps: list(str), figure }) }),
  battle: shape({ title: str, intro: str, ladder_title: str, example: shape({ title: str, units: list(str), steps: list(str) }) }),
  treaties: shape({ intro: str, chart: list(shape({ treaty: str, allies: bool, collection: bool, hands: bool, victory: bool })) }),
  units: shape({ note: str }),
  // How many entries each list beside the rulebook holds, from the game's own catalogues.
  counts: shape({ tiles: byLayout(count), wizard_units: count, robot_units: count, treaties: count, battle_deck: count, heroes: count }),
});
const tile = shape({ c: num, r: num, resource: str, label: str, start: (x) => x === undefined || x === null || pos(x) });
/** A unit fights with all three numbers or none (a collector, a token). */
const unit: Check = (u) => obj(u)
  && str(u['name']) && str(u['species']) && typeof u['notes'] === 'string'
  && obj(u['cost']) && Object.keys(u['cost']).length > 0 && Object.values(u['cost']).every(pos)
  && (['init', 'dmg', 'def'].every((k) => u[k] === null) || ['init', 'dmg', 'def'].every((k) => num(u[k]) && (u[k] as number) >= 0));
const treaty = shape({ name: str, cultureIncome: pos, breakingCondition: str });
const battleCard = shape({ label: str, effect: str, copies: count });
/** The hero the battle ladder draws with its own stat line; the reader finds it by this category. */
const LADDER_HERO = 'evo-angel';
const hero: Check = (h) => obj(h) && str(h['name']) && str(h['category'])
  && (h['category'] !== LADDER_HERO || shape({ init: num, dmg: num, def: num })(h['stats']));
const COUNTS = ['2', '3', '4', '5', '6'];
const perCount = (each: Check): Check => shape(Object.fromEntries(COUNTS.map((n) => [n, each])));
const victory = shape({
  // Every milestone column the page draws (five), each a real number.
  milestones_by_player_count: perCount((m) => Array.isArray(m) && m.length === 5 && m.every(pos)),
  culture_target_by_player_count: perCount(pos),
  military_kills_needed: perCount(pos),
  economic_collectors_by_layout: shape({ two: pos, threeFour: pos, fiveSix: pos }),
  tech_target: shape({ wizard: pos }),
});

/** The raw reference data holds every part the rulebook page draws, each whole. */
function nggDataWhole(raw: unknown): boolean {
  if (!obj(raw) || !rulebookText(raw['rulebook']) || !victory(raw['victory'])) return false;
  const text = raw['rulebook'] as { players_by_layout: Record<string, number[]>; counts: NggCounts };
  const n = text.counts;
  if (!whole(raw['wizard_units'], n.wizard_units, unit) || !whole(raw['robot_units'], n.robot_units, unit)) return false;
  if (!whole(raw['treaties'], n.treaties, treaty) || !whole(raw['battle_deck'], n.battle_deck, battleCard)) return false;
  if (!whole(raw['heroes'], n.heroes, hero)) return false;
  // The ladder's hero row needs its hero there, not just the right number of heroes.
  if (!(raw['heroes'] as Array<Record<string, unknown>>).some((h) => h['category'] === LADDER_HERO)) return false;
  const maps = raw['maps'];
  if (!obj(maps)) return false;
  return NGG_LAYOUTS.every((k) => {
    const tiles = maps[k];
    if (!whole(tiles, n.tiles[k], tile)) return false;
    const ts = tiles as Array<{ c: number; r: number; start?: number | null }>;
    // No two tiles on one spot, and one start tile per seat the map holds.
    const spots = new Set(ts.map((t) => `${t.c},${t.r}`));
    const starts = ts.filter((t) => t.start != null).length;
    return spots.size === ts.length && starts === Math.max(...text.players_by_layout[k]!);
  });
}
type NggCounts = { tiles: Record<(typeof NGG_LAYOUTS)[number], number>; wizard_units: number; robot_units: number; treaties: number; battle_deck: number; heroes: number };

export function rulebookFor(gameId: string): RulebookPage | null {
  return RULEBOOKS[gameId] ?? null;
}

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue, adventurerOlympicsGlue, wordDebaucheeGlue };

// Warble Way Galaxy's dev page also shows the theme's icons, holograms and
// travel cards on their own, and two tests check the pictures they name
// against the files this site serves; they reach them through here.
export { warbleWayGallery } from '@zekel/warble-way-galaxy/glue';
