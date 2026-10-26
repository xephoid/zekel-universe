// The shapes the Universe server sends a game's drawing code about the game
// itself: a legal move as the engine lists it, a move the engine says is
// unavailable and why, and the game's reference data. A glue reads every
// number from these, never from a constant of its own. The website's own
// types (people, tables, events) are not here; they are Universe's.

/**
 * GET /api/games/:id/reference: what the engine publishes about a game.
 * The rules text, the game's reference data (card catalogs, caps, thresholds)
 * and the shapes its moves and options take. Universe reads numbers from here
 * instead of copying them.
 */
export interface GameReferenceResponse {
  gameId: string;
  rules: string;
  referenceData: unknown;
  moveSchema: unknown;
  optionsSchema: unknown;
}

/** The engine's LegalMove: a move plus its id and a description. */
export interface LegalMove {
  move_id?: string;
  description?: string;
  move: Record<string, unknown>;
  /**
   * What taking this move spends, in the game's own printed words — "4 AP",
   * "free, once per game". The engine supplies it; a game with no prices
   * leaves it out. Universe prints it beside the decision and never parses a
   * cost out of `description` or works one out for itself.
   */
  cost?: string;
  /**
   * Where taking this move puts a piece, for a game whose moves move pieces:
   * `{ piece, from, to, path, stops? }` in the game's own location shape. The
   * engine supplies it; Universe outlines the destination and slides the piece
   * along the path from it, and never works movement out for itself.
   */
  landing?: { piece: string; from: unknown; to: unknown; path: unknown[]; stops?: unknown[] };
}

/**
 * A move the engine says this seat cannot make right now, and why, in the
 * engine's words. `item` names one blocked option of the type (a unit or
 * building by printed name, a technology) while others of the type may still
 * be offered; absent, the whole type is unavailable.
 */
export interface UnavailableMove {
  moveType: string;
  item?: string;
  reason: string;
}
