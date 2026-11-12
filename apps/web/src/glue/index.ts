// The games this Universe can draw: each game's glue module by engine game
// id. The rules a glue follows are @zekel/glue-kit; this file is only the
// list. Every game's screen lives with the game in zekel-games and is
// installed from npm as `@zekel/<game>/glue`: this is "the game packages
// installed". Nothing else in the app may import a game package; it reaches
// a game through here (tests/glue-boundary.test.ts).

import type { GlueModule } from '@zekel/glue-kit';
import { adventurerOlympicsGlue } from '@zekel/adventurer-olympics/glue';
import { cybernoirGlue } from '@zekel/cybernoir-2127/glue';
import { fracturedFistGlue } from '@zekel/fractured-fist/glue';
import { nggGlue } from '@zekel/neither-guts-nor-gears/glue';
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

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue, adventurerOlympicsGlue, wordDebaucheeGlue };

// Warble Way Galaxy's dev page also shows the theme's icons, holograms and
// travel cards on their own, and two tests check the pictures they name
// against the files this site serves; they reach them through here.
export { warbleWayGallery } from '@zekel/warble-way-galaxy/glue';
