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
 * Neither Guts nor Gears' reader (0.1.4) accepts a rulebook with the win
 * numbers or maps missing and draws zeros for them, so the page also needs
 * those parts present: a wrong number is worse than the plain text.
 */
function nggRulebookReady(reference: GameReferenceResponse | null): boolean {
  const data = readNggRulebook(reference?.referenceData);
  if (!data) return false;
  const v = data.victory;
  const counts = [2, 3, 4, 5, 6];
  const heroes = (reference?.referenceData as Record<string, unknown> | undefined)?.['heroes'];
  // Every milestone column the page draws (five), each a real number.
  const milestonesOk = (n: number) => (v.milestones[n]?.length ?? 0) === 5 && v.milestones[n]!.every((m) => m > 0);
  return counts.every((n) => (v.cultureTarget[n] ?? 0) > 0 && (v.kills[n] ?? 0) > 0 && milestonesOk(n))
    && Array.isArray(heroes) && heroes.length > 0
    && v.tech > 0
    && Object.values(v.economicCollectors).every((x) => x > 0)
    && Object.values(data.maps).every((tiles) => tiles.length > 0)
    && data.wizardUnits.length > 0 && data.robotUnits.length > 0 && data.treaties.length > 0 && data.deck.length > 0;
}

export function rulebookFor(gameId: string): RulebookPage | null {
  return RULEBOOKS[gameId] ?? null;
}

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue, adventurerOlympicsGlue, wordDebaucheeGlue };

// Warble Way Galaxy's dev page also shows the theme's icons, holograms and
// travel cards on their own, and two tests check the pictures they name
// against the files this site serves; they reach them through here.
export { warbleWayGallery } from '@zekel/warble-way-galaxy/glue';
