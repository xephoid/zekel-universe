// A game glue module maps a seat view (unknown JSON from the server) onto a
// primitive tree, and legal moves onto lit part ids. Glues never decide
// rules; they only draw what the engine said, and they read every number
// from the view or from the engine's reference data, never from a constant.

import type {
  BagData, CardZoneData, GridData, MapData, Palette, PoolData, SelectEvent, TableauData, TrackData,
} from '@universe/primitives';
import type { GameReferenceResponse, LegalMove } from '@universe/shared';

export type { LegalMove, SelectEvent, Palette };

export interface GlueInput {
  view: unknown;
  /** the view before this event, for motion hints */
  previous: unknown;
  /** this seat's legal moves right now */
  legalMoves: LegalMove[];
  /** the engine's player id for the viewing seat */
  playerId: string | null;
  /** the engine's reference data for the game, once loaded */
  reference: GameReferenceResponse | null;
  /** the sequence number of the event on screen; the same view is planned many times */
  seq: number;
  /** the move that produced this view, when known */
  engineMove: Record<string, unknown> | null;
  /** the engine player id of the seat that made the move, when known */
  actorPlayerId: string | null;
  /** scratch space the table keeps for this glue across events */
  memory: Map<string, unknown>;
}

type ZoneBody =
  | { kind: 'card-zone'; id: string; data: CardZoneData; arriveFrom?: string }
  | { kind: 'tableau'; id: string; data: TableauData; children?: Zone[] }
  | { kind: 'bag'; id: string; data: BagData }
  | { kind: 'track'; id: string; data: TrackData }
  | { kind: 'pool'; id: string; data: PoolData }
  | { kind: 'grid'; id: string; data: GridData }
  | { kind: 'map'; id: string; data: MapData };

/** A zone, with one layout hint: `span: 'full'` takes a whole row of the
 *  board instead of flowing beside its neighbours. */
export type Zone = ZoneBody & { span?: 'full' };

/** One step of the turn, for the action bar's chips. */
export interface PlanStep { id: string; label: string; current?: boolean }

/**
 * A button in the action bar. Each is bound to a move the engine listed,
 * or to a batch: a series of taps sent one at a time, each only once the
 * engine lists the move it stands for (see glue/agency.ts).
 */
export type PromptAction =
  | { id: string; label: string; note?: string; title?: string; primary?: boolean; move: LegalMove }
  | { id: string; label: string; note?: string; title?: string; primary?: boolean; batch: SelectEvent[] };

/** The action bar: what step it is, what you can do now, and the buttons
 *  that move the turn. Text only; every number in it comes from the view. */
export interface PlanPrompt {
  title: string;
  sub?: string;
  actions: PromptAction[];
  /** the prompt is an interrupt (a refine window): drawn in the warning color */
  urgent?: boolean;
}

/** One hit of a strike: what was queued, what was in the way, what the
 *  engine says got through, and the target's meter before and after. */
export interface StrikeLane {
  /** engine player ids; the table names them from the seats */
  attacker: string;
  target: string;
  hit: number;
  shield: number;
  /** read from the engine's result, never computed here */
  through: number;
  before: number;
  after: number;
  max: number;
}

/**
 * A scripted beat the table plays over the board before an event lands,
 * when the glue reads a resolution in the difference between the view on
 * screen and the one arriving. Nothing in it asks the player anything, so
 * it closes itself; pace, skip and replay are the playback queue's.
 */
export type Moment = { kind: 'strike'; key: string; title: string; lanes: StrikeLane[]; over: boolean };

/** What a glue gets to decide whether an arriving event deserves a moment. */
export interface MomentInput {
  before: unknown;
  after: unknown;
  summary: string;
  engineMove: Record<string, unknown> | null;
  playerId: string | null;
  reference: GameReferenceResponse | null;
}

/** A glue maps a view onto zones; the table page lays them out in the bench. */
export interface TablePlan {
  /** zones pinned to the center board area */
  board: Zone[];
  /** this seat's bench: the hand along the bottom */
  bench: Zone[];
  /** opponent and shared panels stacked in the side column */
  side: Zone[];
  /** the points track for the side column, when the game has one */
  points?: Zone;
  /** color key to css color, supplied by the game */
  palette: Palette;
  /** the game's display name for the top bar */
  title: string;
  /** one line for the turn indicator, e.g. "Round 3 · Technique phase" */
  status?: string;
  /** the turn's steps, one current, for the action bar */
  steps?: PlanStep[];
  /** the action bar's words and buttons */
  prompt?: PlanPrompt;
}

/** One option of a multi pick; the extras draw it as a card in a grouped picker. */
export interface MultiOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
  /** a small number in the corner (a cost) */
  badge?: string;
  /** short effect lines */
  chips?: string[];
  /** a quiet tag under the chips ("in the default seven") */
  tag?: string;
}

/** One of the game's own setup choices, presented as a field the player fills in. */
export type SetupField =
  | { key: string; label: string; help?: string; kind: 'choice'; options: Array<{ value: string; label: string; hint?: string }> }
  | {
      key: string; label: string; help?: string; kind: 'multi';
      options: MultiOption[];
      /** exactly this many */
      pick: number;
      /** sections to draw the options in, in order; an option names its section by `group` */
      groups?: Array<{ key: string; label: string; note?: string; color?: string }>;
      /** a named set the player may take with one press; never preselected */
      preset?: { label: string; values: string[] };
      /** what the picks add up to, beside the numbered slots */
      summarize?: (values: string[]) => { chips: string[]; note?: string };
      /** what one pick is called, e.g. "technique" */
      noun?: string;
    }
  | { key: string; label: string; help?: string; kind: 'text'; placeholder?: string; maxLength?: number }
  | { key: string; label: string; help?: string; kind: 'number'; min?: number; max?: number };

/** A seat as the setup screen has it: who sits there, before the table exists. */
export interface SetupSeat {
  position: number;
  kind: 'human' | 'ai';
  /** the host's own seat */
  host: boolean;
  aiDifficulty?: string;
}

/** The answers on the setup screen, by field key; multi picks are lists. */
export type SetupAnswers = Record<string, string | string[]>;

/** One question a template move asks the player before it can be sent. */
export type FormField =
  | { kind: 'text'; key: string; label: string; help?: string; placeholder?: string; maxLength?: number }
  | { kind: 'number'; key: string; label: string; help?: string; min?: number; max?: number }
  | { kind: 'choice'; key: string; label: string; help?: string; options: Array<{ value: string; label: string; hint?: string }> }
  | { kind: 'multi'; key: string; label: string; help?: string; options: Array<{ value: string; label: string; hint?: string }>; pick: number };

/**
 * A legal move the engine lists as a template ("FILL IN the values the
 * player chose"): the table asks these questions and sends the completed
 * move only when the player presses the form's button. Nothing is
 * preselected; a default the engine put in the template is a placeholder,
 * never an answer.
 */
export interface MoveForm {
  title: string;
  help?: string;
  fields: FormField[];
  /** the template this form completes */
  template: LegalMove;
  /** top-level move keys the answers may set or replace */
  editableKeys: string[];
  /** the move from the answers, or null while any answer is missing */
  build(answers: Record<string, unknown>): Record<string, unknown> | null;
  submitLabel?: string;
}

export interface GlueModule {
  gameId: string;
  title: string;
  /** Build a plan, or null when the view does not match this game's shape;
   *  the table then renders the generic JSON inspector. */
  plan(input: GlueInput): TablePlan | null;
  /** lit part ids for the current legal moves */
  litParts(input: GlueInput): string[];
  /** Given a tap on a lit part, the legal move it submits, or null. */
  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null;
  /** Every legal move a tap on this part could mean. One means send it;
   *  several means the table asks which (a chooser). Defaults to moveForSelect. */
  movesForSelect?(sel: SelectEvent, input: GlueInput): LegalMove[];
  /** The questions a template move asks before it can be sent, or null for a
   *  move that is complete as listed. */
  formFor?(move: LegalMove, input: GlueInput): MoveForm | null;
  /** Roll/Draw appears iff a legal move is a resolve_report */
  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null;
  /**
   * A moment the arriving event deserves (a strike), read from the view on
   * screen and the one arriving, or null. The table plays it before the
   * event lands, so the board still shows the state the moment resolves.
   */
  momentFor?(input: MomentInput): Moment | null;
  /**
   * The game's own setup choices, from the engine's options schema and
   * reference data, for the seats as set up. Choices that belong to a friend
   * who is not here yet are not listed; they stay at the table.
   */
  setupFields(reference: GameReferenceResponse, seats?: SetupSeat[]): SetupField[];
  /** The part of the answers that goes to the engine as session options. */
  setupOptions?(answers: SetupAnswers, seats: SetupSeat[]): Record<string, unknown>;
  /**
   * The part of the answers the engine takes as moves once the session
   * exists (a faction per seat, the foe, a character), by the host's seat,
   * in order. The server applies them before the table opens.
   */
  setupMoves?(answers: SetupAnswers, seats: SetupSeat[], reference: GameReferenceResponse): Array<Record<string, unknown>>;
  /** A caption for a roll or draw event, when the glue can read the result. */
  diceFor?(event: { engineMove: Record<string, unknown> | null; summary: string; view: unknown }): number[] | null;
}

// Small helpers shared by every glue ---------------------------------------

export function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Guarded read: view is a plain object with every required key present. */
export function shapeHas(view: unknown, ...keys: string[]): view is Record<string, unknown> {
  return isObj(view) && keys.every((k) => k in view);
}

export function asArr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

export function asNum(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

export function asStr(x: unknown, fallback = ''): string {
  return typeof x === 'string' ? x : fallback;
}

export function asBool(x: unknown): boolean {
  return x === true;
}

/** Turn an id like "the_awakened" or "motive_set_1" into printed words. */
export function words(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
