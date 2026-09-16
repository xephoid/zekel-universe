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

export type Zone =
  | { kind: 'card-zone'; id: string; data: CardZoneData; arriveFrom?: string }
  | { kind: 'tableau'; id: string; data: TableauData; children?: Zone[] }
  | { kind: 'bag'; id: string; data: BagData }
  | { kind: 'track'; id: string; data: TrackData }
  | { kind: 'pool'; id: string; data: PoolData }
  | { kind: 'grid'; id: string; data: GridData }
  | { kind: 'map'; id: string; data: MapData };

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
}

/** One of the game's own setup choices, presented as a field the player fills in. */
export interface SetupField {
  key: string;
  label: string;
  help?: string;
  kind: 'choice' | 'multi';
  options: Array<{ value: string; label: string; hint?: string }>;
  /** for multi: exactly this many */
  pick?: number;
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
  /** Roll/Draw appears iff a legal move is a resolve_report */
  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null;
  /** The game's own setup choices, from the engine's options schema and reference data. */
  setupFields(reference: GameReferenceResponse): SetupField[];
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
