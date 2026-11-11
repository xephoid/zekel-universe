// The rules every game's drawing code follows, the shared code behind them,
// and the three pieces of table furniture a game's own screen may draw (the
// sheet, the move form sheet, the pace control; their styles are ./css). A
// game's glue imports from here and from @zekel/primitives, never from the
// web app.

export type {
  GlueModule, GameScreenProps, GlueInput, TablePlan, Zone, SetupField, MultiOption, SetupSeat, SetupAnswers,
  LegalMove, SelectEvent, Palette, MoveForm, FormField, PlanStep, PlanPrompt, PromptAction,
  Moment, MomentInput, MomentProps, Pace,
} from './types.js';
export { PACES, asArr, asBool, asNum, asStr, isObj, shapeHas, words } from './types.js';
export { classifyMoves, completesTemplate, isSubmissionAllowed, movesEqual, submitMove, submissionLog } from './agency.js';
export type { SubmissionTrigger, FormContext, Submission } from './agency.js';
export { answerList, answerNumber, answerText, blankKeys, formForMove, looksLikeTemplate, movesForSelect, templateForm } from './forms.js';
export { trackIdentities } from './identity.js';
export type { IdentityHints, IdentityState, ZoneContents } from './identity.js';
export { BoardZones, JsonInspector, ZoneRenderer } from './ZoneRenderer.js';
export { Sheet } from './Sheet.js';
export { MoveFormSheet } from './MoveFormSheet.js';
export { PaceControl } from './PaceControl.js';
