import type { GlueModule } from './types';
import { fracturedFistGlue } from './fractured-fist';
import { warbleWayGlue } from './warble-way-galaxy';
import { sweetlandsGlue } from './sweetlands-imperium';
import { cybernoirGlue } from './cybernoir-2127';
import { nggGlue } from './ngg';

export const GLUES: Record<string, GlueModule> = {
  'fractured-fist': fracturedFistGlue,
  'warble-way-galaxy': warbleWayGlue,
  'sweetlands-imperium': sweetlandsGlue,
  'cybernoir-2127': cybernoirGlue,
  'neither-guts-nor-gears': nggGlue,
};

export function glueFor(gameId: string): GlueModule | null {
  return GLUES[gameId] ?? null;
}

export { fracturedFistGlue, warbleWayGlue, sweetlandsGlue, cybernoirGlue, nggGlue };
export type { GlueModule, GameScreenProps, GlueInput, TablePlan, Zone, SetupField, MultiOption, SetupSeat, SetupAnswers, LegalMove, SelectEvent, MoveForm, FormField, PlanStep, PlanPrompt, PromptAction, Moment, MomentInput, StrikeLane } from './types';
export { classifyMoves, completesTemplate, isSubmissionAllowed, movesEqual, submitMove, submissionLog } from './agency';
export type { SubmissionTrigger, FormContext } from './agency';
export { formForMove, movesForSelect, templateForm } from './forms';
