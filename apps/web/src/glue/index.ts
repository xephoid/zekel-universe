// The games this Universe can draw: each game's glue module by engine game
// id. The rules a glue follows are @zekel/glue-kit; this file is only the
// list. When the games move to their own packages (zekel-games), this
// becomes "the game packages installed".

import type { GlueModule } from '@zekel/glue-kit';
import { fracturedFistGlue } from './fractured-fist';
import { warbleWayGlue } from './warble-way-galaxy';
import { sweetlandsGlue } from './sweetlands-imperium';
import { cybernoirGlue } from './cybernoir-2127';
import { nggGlue } from './ngg';
import { adventurerOlympicsGlue } from './ao';

export const GLUES: Record<string, GlueModule> = {
  'fractured-fist': fracturedFistGlue,
  'warble-way-galaxy': warbleWayGlue,
  'sweetlands-imperium': sweetlandsGlue,
  'cybernoir-2127': cybernoirGlue,
  'neither-guts-nor-gears': nggGlue,
  'adventurer-olympics': adventurerOlympicsGlue,
};

export function glueFor(gameId: string): GlueModule | null {
  return GLUES[gameId] ?? null;
}

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue, adventurerOlympicsGlue };
