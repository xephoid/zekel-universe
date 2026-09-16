// Types shared by the server and the web app.

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

export type SeatKind = 'human' | 'ai';
export type TableMode = 'live' | 'turns';
export type TableStatus = 'lobby' | 'playing' | 'finished';

export interface Seat {
  id: string;
  tableId: string;
  position: number;
  kind: SeatKind;
  userId: string | null;
  guestId: string | null;
  aiDifficulty: string | null;
  enginePlayerId: string | null;
  setupChoices: Record<string, unknown>;
  ready: boolean;
}

export interface GameTable {
  id: string;
  gameId: string;
  hostUserId: string | null;
  hostGuestId: string | null;
  mode: TableMode;
  status: TableStatus;
  engineSessionId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export type TableEventKind = 'setup' | 'move' | 'ai_move' | 'roll' | 'draw' | 'system';

export interface TableEvent {
  id: string;
  tableId: string;
  seq: number;
  kind: TableEventKind;
  actorSeatPosition: number | null;
  summary: string;
  engineMove: Record<string, unknown> | null;
  // Per-seat views keyed by seat position. The server strips all but the
  // receiving seat's view before sending to a browser.
  views: Record<string, unknown>;
  createdAt: string;
}

/** What a browser actually receives on the websocket. */
export interface TableEventWire {
  seq: number;
  kind: TableEventKind;
  actorSeatPosition: number | null;
  summary: string;
  engineMove: Record<string, unknown> | null;
  view: unknown | null; // the receiving seat's view, or public view for spectators
}

export interface LegalMove {
  id: string;
  description: string;
  move: Record<string, unknown>;
}

export interface GameCatalogEntry {
  engineGameId: string;
  name: string;
  designerName: string;
  playerCount: string;
  playTime: string;
  tags: string[];
  coverImage: string | null;
  description: string;
  rulesUrl: string | null;
  visibility: 'public' | 'unlisted';
}
