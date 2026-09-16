// Types shared by the server and the web app. This file is the wire contract:
// every REST response and every socket message the browser reads is typed
// here, and the server builds exactly these shapes.

// ---- people -----------------------------------------------------------------

export interface User {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface Guest {
  id: string;
  displayName: string;
  upgradedToUserId: string | null;
}

/** GET /api/me */
export interface MeResponse {
  user: User | null;
  guest: Guest | null;
}

// ---- catalog ----------------------------------------------------------------

export interface GameCatalogEntry {
  engineGameId: string;
  name: string;
  designerName: string;
  playerCount: string;
  minPlayers: number;
  maxPlayers: number;
  supportsAi: boolean;
  playTime: string;
  tags: string[];
  coverImage: string | null;
  description: string;
  rulesUrl: string | null;
  visibility: 'public' | 'unlisted';
}

/** GET /api/games */
export interface GamesResponse {
  games: GameCatalogEntry[];
}

/** GET /api/games/:id */
export interface GameResponse {
  game: GameCatalogEntry;
}

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

// ---- tables -----------------------------------------------------------------

export type SeatKind = 'human' | 'ai';
export type TableMode = 'live' | 'turns';
export type TableStatus = 'lobby' | 'playing' | 'finished';

/** One seat as the browser sees it. Never carries another person's tokens. */
export interface SeatSummary {
  position: number;
  kind: SeatKind;
  aiDifficulty: string | null;
  ready: boolean;
  /** owned by the requesting principal */
  mine: boolean;
  taken: boolean;
  displayName: string | null;
}

export interface TableSummary {
  id: string;
  gameId: string;
  gameName: string;
  mode: TableMode;
  status: TableStatus;
  createdAt: string;
  finishedAt: string | null;
  /** the requesting principal hosts this table */
  hostIsMe: boolean;
  /** seat position whose owner is up next; null when an AI is up or nobody */
  nextActorPosition: number | null;
  /** the requesting principal is up next */
  waitingOnMe: boolean;
}

/** GET /api/tables/:id */
export interface TableResponse {
  table: TableSummary;
  seats: SeatSummary[];
  /** seat positions the requesting principal owns at this table */
  mySeats: number[];
}

/** GET /api/my-tables */
export interface MyTablesResponse {
  tables: TableSummary[];
}

export interface SeatSpec {
  kind: SeatKind;
  aiDifficulty?: string;
}

/** POST /api/tables */
export interface CreateTableRequest {
  gameId: string;
  mode: TableMode;
  seats: SeatSpec[];
  hostPosition: number;
  /** the game's own setup options, as the engine's options schema describes */
  options?: Record<string, unknown>;
}

export interface CreateTableResponse {
  tableId: string;
  status: TableStatus;
}

/** Every error body the API returns. */
export interface ApiError {
  error: string;
  message?: string;
}

// ---- engine shapes the browser reads ------------------------------------------

/** The engine's LegalMove: a move plus its id and a description. */
export interface LegalMove {
  move_id?: string;
  description?: string;
  move: Record<string, unknown>;
}

export interface MoveMenuEntry {
  key: string;
  label: string;
  move_id?: string;
  count?: number;
  group_by?: string;
  submenu?: MoveMenuEntry[];
}

/** The engine's numbered move menu; what voice reads later. */
export interface MoveMenu {
  prompt: string;
  entries: MoveMenuEntry[];
  total_moves?: number;
  collapsed?: boolean;
  free_text_hint?: string;
}

export interface RulesBriefingSection {
  id: string;
  title: string;
  text: string;
}

/** A rules lesson the engine attaches the first time a rule matters. */
export interface RulesBriefing {
  for_player?: string;
  sections: RulesBriefingSection[];
  teach_note?: string;
}

export interface GameOverResult {
  winners: string[];
  scores: Record<string, number>;
  summary: string;
}

// ---- table events -------------------------------------------------------------

export type TableEventKind = 'setup' | 'move' | 'ai_move' | 'roll' | 'draw' | 'system' | 'undo';

/**
 * What one seat may see of an event. Stored per seat on the event row and
 * sent only to that seat's connections.
 */
export interface SeatPayload {
  view: unknown;
  /** this seat's legal moves after the event, when the event ends a flow */
  legalMoves?: LegalMove[];
  moveMenu?: MoveMenu | null;
  briefing?: RulesBriefing | null;
  yourTurn?: boolean;
  /** the engine's player id for this seat, so the view can find "me" */
  playerId?: string;
}

/** What a browser actually receives on the websocket and from the events feed. */
export interface TableEventWire {
  seq: number;
  kind: TableEventKind;
  actorSeatPosition: number | null;
  summary: string;
  engineMove: Record<string, unknown> | null;
  /** the receiving seat's view after this event */
  view: unknown;
  legalMoves: LegalMove[];
  moveMenu: MoveMenu | null;
  briefing: RulesBriefing | null;
  yourTurn: boolean;
  playerId: string | null;
  /** seat position up next, or null when an AI is up or the game is over */
  nextActorPosition: number | null;
  /** present on the final event */
  gameOver: GameOverResult | null;
  /** on an undo event: the sequence number the board rewinds to */
  rewindToSeq: number | null;
  createdAt: string;
}

/** GET /api/tables/:id/events?after=N */
export interface TableEventsResponse {
  events: TableEventWire[];
}

// ---- socket messages ------------------------------------------------------------

export interface JoinTableMessage {
  tableId: string;
  lastSeenSeq?: number;
}

export type JoinTableAck =
  | { ok: true; seats: number[]; status: TableStatus }
  | { ok?: false; error: string; message?: string };

export interface MoveMessage {
  tableId: string;
  seat: number;
  move: Record<string, unknown>;
}

export type MoveAck =
  | { ok: true; lastSeq: number }
  | {
      ok?: false;
      /** move_rejected (a rule), or a server or engine fault code */
      error: string;
      reason?: string;
      lesson?: string;
      legalMoves?: LegalMove[];
    };

export interface UndoMessage {
  tableId: string;
}

export type UndoAck =
  | { ok: true; seq: number }
  | { ok?: false; error: string; message?: string };

/** Socket event names, in one place so both sides agree. */
export const SOCKET_EVENTS = {
  /** client to server */
  joinTable: 'join_table',
  leaveTable: 'leave_table',
  move: 'move',
  undo: 'undo',
  /** server to client */
  tableEvent: 'table_event',
  tableStatus: 'table_status',
} as const;

export interface TableStatusMessage {
  tableId: string;
  status: TableStatus;
}
