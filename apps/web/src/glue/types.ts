// A game glue module maps a seat view (unknown JSON from the server) onto a
// primitive tree, and legal moves onto lit part ids. Glues never decide rules;
// they only draw what the engine said. Universe never submits a move without a
// person's tap — see agency.ts.

import type { ReactNode } from 'react';
import type { LegalMove, SelectEvent } from './primitiveTree';

export interface Palette { [colorKey: string]: string }

export interface GlueInput {
  view: unknown;
  /** the view before this event, for FLIP animation */
  previous: unknown;
  /** this seat's legal moves right now */
  legalMoves: LegalMove[];
  onSelect: (e: SelectEvent) => void;
}

export type ZoneKind =
  | 'card' | 'card-zone' | 'tableau' | 'bag' | 'track' | 'pool' | 'grid' | 'map';

/** A glue maps a view onto zones; the table page lays them out in the bench. */
export interface TablePlan {
  /** zones pinned to the center board area */
  board: Zone[];
  /** this seat's bench — the hand along the bottom */
  bench: Zone[];
  /** opponent / shared panels stacked in the side column */
  side: Zone[];
  /** color key → css color, supplied by the game */
  palette: Palette;
  /** the game's display name for the top bar */
  title: string;
}

export interface Zone {
  kind: ZoneKind;
  /** data object for the matching primitive component */
  data: Record<string, unknown>;
  /** same shape, from previous view (FLIP) */
  previous?: Record<string, unknown>;
  /** subtitle shown above the zone */
  label?: string;
}

export interface GlueModule {
  gameId: string;
  /** Build a plan, or null when the view doesn't match this game's shape —
   *  the table then renders the generic JSON inspector. */
  plan(input: GlueInput): TablePlan | null;
  /** lit part ids for the current legal moves */
  litParts(view: unknown, legalMoves: LegalMove[]): string[];
  /**
   * Given a click on a lit part, return the legal move it submits.
   * Returns null when the click doesn't map onto a move (table ignores it).
   */
  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null;
  /** Roll/Draw appears iff a legal move is a resolve_report */
  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null;
  /** Rendered as a React tree by ZoneRenderer; glue returns data only. */
}

// Small helpers shared by every glue ---------------------------------------

export function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Guarded read: view is a plain object with every required key an object/array-ish. */
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

// Re-exported for ZoneRenderer convenience
export type { LegalMove, SelectEvent };
export type { ReactNode };
