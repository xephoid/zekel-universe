// Database row types for Kysely. One schema serves SQLite (local, tests)
// and Postgres (production): every column uses a type both understand.
// Booleans are integers 0/1, JSON is text, timestamps are ISO-8601 text.
// Column names are snake_case as stored; the code maps to camelCase at the
// edges where it matters.

export interface UsersTable {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}

export interface IdentitiesTable {
  id: string;
  user_id: string;
  provider: string; // 'email', later 'google', 'github', ...
  provider_subject: string; // e.g. the email address
}

export interface AuthSessionsTable {
  id: string;
  user_id: string;
  token_hash: string; // sha256 of the cookie token
  created_at: string;
  expires_at: string;
  /** Proof of the sign-in link that made this session (see linkProof in
   *  app.ts); null for sessions from before it was recorded. */
  link_hash?: string | null;
}

export interface GuestsTable {
  id: string;
  token_hash: string; // sha256 of the cookie token
  display_name: string;
  created_at: string;
  upgraded_to_user_id: string | null;
  /** When the guest token stops working. Null on rows from before schema
   *  6, which expire GUEST_TTL_MS after created_at. */
  expires_at: string | null;
}

/** Pending passwordless sign-in links. Consumed on first use, expire fast. */
export interface SignInLinksTable {
  id: string;
  token_hash: string;
  email: string;
  created_at: string;
  expires_at: string;
  /** sha256 of the nonce cookie set in the browser that asked for the
   *  link; completion must present the same nonce. */
  nonce_hash: string | null;
}

export interface FriendshipsTable {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string; // 'pending' | 'accepted'
  created_at: string;
}

export interface GamesTable {
  engine_game_id: string;
  name: string;
  designer_name: string;
  player_count: string;
  min_players: number;
  max_players: number;
  supports_ai: number;
  play_time: string;
  tags: string; // JSON string[]
  cover_image: string | null;
  description: string;
  rules_url: string | null;
  visibility: string; // 'public' | 'unlisted'
  /** the designer's profile (designers.slug); null for a game with none */
  designer_slug?: string | null;
  /** CSS object-position a frame cropping the square cover keeps ("50% 18%") */
  cover_focus?: string | null;
  screenshots?: string; // JSON string[] of image paths (/art/... or /media/...)
  /** place among the featured games, lowest first; null when not featured */
  featured_rank?: number | null;
}

export interface DesignersTable {
  slug: string;
  name: string;
  bio: string;
  avatar_image: string | null;
}

/** Images uploaded on the admin page, served at /media/<id>. */
export interface MediaTable {
  id: string;
  content_type: string; // image/png | image/jpeg | image/webp
  data: string; // base64
  byte_size: number;
  uploaded_by: string; // users.id
  created_at: string;
}

export interface GameUpdatesTable {
  id: string;
  game_id: string;
  title: string;
  body: string;
  posted_at: string;
  /** set when an admin removes the update; the row stays so the seed
   *  never brings it back */
  deleted_at?: string | null;
}

export interface TablesTable {
  id: string;
  game_id: string;
  host_user_id: string | null;
  host_guest_id: string | null;
  mode: string; // 'live' | 'turns'
  status: string; // 'lobby' | 'playing' | 'finished'
  engine_session_id: string | null;
  encrypted_host_token: string | null;
  options: string; // JSON: the game's own setup options
  setup_moves: string | null; // JSON: the host's setup choices as engine moves
  next_actor_position: number | null;
  result: string | null; // JSON GameOverResult once finished
  created_at: string;
  finished_at: string | null;
}

export interface SeatsTable {
  id: string;
  table_id: string;
  position: number;
  kind: string; // 'human' | 'ai'
  user_id: string | null;
  guest_id: string | null;
  ai_difficulty: string | null;
  engine_player_id: string | null;
  ready: number;
}

export interface InvitesTable {
  id: string;
  table_id: string;
  from_user_id: string;
  to_user_id: string;
  status: string; // 'pending' | 'accepted' | 'declined'
}

/**
 * The playback feed and the log. `payloads` holds every seat's private
 * payload keyed by seat position; the server sends each connection only its
 * own seat's entry.
 */
export interface TableEventsTable {
  id: string;
  table_id: string;
  seq: number;
  kind: string;
  actor_seat_position: number | null;
  summary: string;
  engine_move: string | null; // JSON
  payloads: string; // JSON Record<seatPosition, SeatPayload>
  next_actor_position: number | null;
  game_over: string | null; // JSON GameOverResult
  rewind_to_seq: number | null;
  created_at: string;
  log_entries: string; // JSON LogLine[] (public)
}

export interface NotificationsTable {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  kind: string; // 'your_turn' | 'invite' | 'table_finished'
  table_id: string | null;
  read: number;
  created_at: string;
  /** when the by-turns email nudge for this notification went out */
  emailed_at: string | null;
}

export interface SchemaVersionTable {
  version: number;
}

export interface DB {
  users: UsersTable;
  identities: IdentitiesTable;
  auth_sessions: AuthSessionsTable;
  guests: GuestsTable;
  sign_in_links: SignInLinksTable;
  friendships: FriendshipsTable;
  games: GamesTable;
  game_updates: GameUpdatesTable;
  designers: DesignersTable;
  media: MediaTable;
  tables: TablesTable;
  seats: SeatsTable;
  invites: InvitesTable;
  table_events: TableEventsTable;
  notifications: NotificationsTable;
  schema_version: SchemaVersionTable;
}
