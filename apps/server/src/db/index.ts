// Database connection. SQLite via better-sqlite3 through Drizzle today; the
// config's DATABASE_URL decides, so a Postgres driver can be added here
// without touching the schema in usage.

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type DatabaseClient = BetterSQLite3Database<typeof schema>;

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  avatar_url text,
  bio text,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL,
  provider_subject text NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS guests (
  id text PRIMARY KEY,
  token_hash text NOT NULL,
  display_name text NOT NULL,
  created_at text NOT NULL,
  upgraded_to_user_id text REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS friendships (
  id text PRIMARY KEY,
  requester_id text NOT NULL REFERENCES users(id),
  addressee_id text NOT NULL REFERENCES users(id),
  status text NOT NULL,
  created_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
  engine_game_id text PRIMARY KEY,
  name text NOT NULL,
  designer_name text NOT NULL DEFAULT '',
  player_count text NOT NULL DEFAULT '',
  play_time text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '[]',
  cover_image text,
  description text NOT NULL DEFAULT '',
  rules_url text,
  visibility text NOT NULL DEFAULT 'public'
);
CREATE TABLE IF NOT EXISTS game_updates (
  id text PRIMARY KEY,
  game_id text NOT NULL REFERENCES games(engine_game_id),
  title text NOT NULL,
  body text NOT NULL,
  posted_at text NOT NULL
);
CREATE TABLE IF NOT EXISTS tables (
  id text PRIMARY KEY,
  game_id text NOT NULL,
  host_user_id text,
  host_guest_id text,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'lobby',
  engine_session_id text,
  encrypted_host_token text,
  created_at text NOT NULL,
  finished_at text
);
CREATE TABLE IF NOT EXISTS seats (
  id text PRIMARY KEY,
  table_id text NOT NULL REFERENCES tables(id),
  position integer NOT NULL,
  kind text NOT NULL,
  user_id text,
  guest_id text,
  ai_difficulty text,
  engine_player_id text,
  setup_choices text NOT NULL DEFAULT '{}',
  ready integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  table_id text NOT NULL REFERENCES tables(id),
  from_user_id text NOT NULL,
  to_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS table_events (
  id text PRIMARY KEY,
  table_id text NOT NULL REFERENCES tables(id),
  seq integer NOT NULL,
  kind text NOT NULL,
  actor_seat_position integer,
  summary text NOT NULL DEFAULT '',
  engine_move text,
  views text NOT NULL DEFAULT '{}',
  created_at text NOT NULL
);
CREATE INDEX IF NOT EXISTS table_events_table_seq ON table_events(table_id, seq);
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text,
  guest_id text,
  kind text NOT NULL,
  table_id text REFERENCES tables(id),
  read integer NOT NULL DEFAULT 0,
  created_at text NOT NULL
);
`;

function pathFromDatabaseUrl(url: string): string {
  if (url.startsWith('sqlite://')) return url.slice('sqlite://'.length);
  if (url === 'sqlite::memory:' || url === ':memory:') return ':memory:';
  throw new Error(
    `Unsupported DATABASE_URL scheme in ${JSON.stringify(url)}; only sqlite:// is wired today. ` +
    'A Postgres driver is planned per the implementation plan.',
  );
}

export function createDatabase(databaseUrl: string): DatabaseClient {
  const file = databaseUrl === ':memory:' || databaseUrl === 'sqlite::memory:'
    ? ':memory:'
    : pathFromDatabaseUrl(databaseUrl);
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}
