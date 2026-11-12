// The games this Universe can draw: each game's glue module by engine game
// id. The rules a glue follows are @zekel/glue-kit; this file is only the
// list. The games are moving to their own packages in zekel-games, where a
// game's screen is `@zekel/<game>/glue`. Word Debauchee and Cybernoir 2127
// have moved and are installed from npm; the others are still folders beside
// this file. When all have moved, this is "the game packages installed".

import type { GlueModule } from '@zekel/glue-kit';
import { fracturedFistGlue } from './fractured-fist';
import { warbleWayGlue } from './warble-way-galaxy';
import { sweetlandsGlue } from './sweetlands-imperium';
import { cybernoirGlue } from '@zekel/cybernoir-2127/glue';
import { nggGlue } from './ngg';
import { adventurerOlympicsGlue } from './ao';
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

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue, adventurerOlympicsGlue, wordDebaucheeGlue };

// Warble Way Galaxy's dev page also shows the theme's icons, holograms and
// travel cards on their own; it reaches them through here.
export * as warbleWayGallery from './ww/gallery';
