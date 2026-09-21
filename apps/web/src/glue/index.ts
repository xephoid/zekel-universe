import type { GlueModule } from './types';
import { fracturedFistGlue } from './fractured-fist';
import { warbleWayGlue } from './warble-way-galaxy';
import { sweetlandsGlue } from './sweetlands-imperium';
import { cybernoirGlue } from './cybernoir-2127';

export const GLUES: Record<string, GlueModule> = {
  'fractured-fist': fracturedFistGlue,
  'warble-way-galaxy': warbleWayGlue,
  'sweetlands-imperium': sweetlandsGlue,
  'cybernoir-2127': cybernoirGlue,
};

export function glueFor(gameId: string): GlueModule | null {
  return GLUES[gameId] ?? null;
}

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue };
export type { GlueModule, GlueInput, TablePlan, Zone, SetupField, SetupSeat, SetupAnswers, LegalMove, SelectEvent, MoveForm, FormField } from './types';
export { classifyMoves, completesTemplate, isSubmissionAllowed, movesEqual, submitMove, submissionLog } from './agency';
export type { SubmissionTrigger, FormContext } from './agency';
export { formForMove, movesForSelect, templateForm } from './forms';
