// Database connection. DATABASE_URL picks the driver: SQLite locally and in
// tests, Postgres in production. Both run the same schema (db/schema.ts)
// through Kysely, whose query builder is dialect-neutral, so the rest of the
// server never knows which one it is talking to.
//
// Accepted DATABASE_URL forms:
//   :memory:  sqlite::memory:  sqlite://:memory:      in-memory (tests)
//   sqlite:./dev.db  sqlite:/data/dev.db              a file path after the scheme
//   sqlite://dev.db  sqlite:///data/dev.db            the same with an authority slash pair
//   postgres://user:pass@host:5432/db  postgresql://…  Postgres

import Database from 'better-sqlite3';
import pg from 'pg';
import { Kysely, PostgresDialect, SqliteDialect, sql } from 'kysely';
import type { DB } from './schema.js';

export type DatabaseDialect = 'sqlite' | 'postgres';

export interface DatabaseClient {
  db: Kysely<DB>;
  dialect: DatabaseDialect;
  close(): Promise<void>;
}

/** Bump when the DDL below changes in a way an existing database cannot absorb. */
export const SCHEMA_VERSION = 4;

export function parseDatabaseUrl(url: string): { dialect: DatabaseDialect; target: string } {
  const trimmed = url.trim();
  if (trimmed === ':memory:' || trimmed === 'sqlite::memory:' || trimmed === 'sqlite://:memory:') {
    return { dialect: 'sqlite', target: ':memory:' };
  }
  if (trimmed.startsWith('sqlite:')) {
    let rest = trimmed.slice('sqlite:'.length);
    if (rest.startsWith('//')) rest = rest.slice(2);
    if (rest === '' ) throw new Error(`DATABASE_URL ${JSON.stringify(url)} names no SQLite file`);
    return { dialect: 'sqlite', target: rest };
  }
  if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) {
    return { dialect: 'postgres', target: trimmed };
  }
  throw new Error(
    `Unsupported DATABASE_URL scheme in ${JSON.stringify(url)}: use sqlite:<path>, sqlite::memory:, or postgres://…`,
  );
}

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_version (
    version integer NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    display_name text NOT NULL,
    avatar_url text,
    bio text,
    created_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS identities (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id),
    provider text NOT NULL,
    provider_subject text NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS identities_provider_subject ON identities(provider, provider_subject)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id),
    token_hash text NOT NULL,
    created_at text NOT NULL,
    expires_at text NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_token ON auth_sessions(token_hash)`,
  `CREATE TABLE IF NOT EXISTS guests (
    id text PRIMARY KEY,
    token_hash text NOT NULL,
    display_name text NOT NULL,
    created_at text NOT NULL,
    upgraded_to_user_id text REFERENCES users(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS guests_token ON guests(token_hash)`,
  `CREATE TABLE IF NOT EXISTS sign_in_links (
    id text PRIMARY KEY,
    token_hash text NOT NULL,
    email text NOT NULL,
    created_at text NOT NULL,
    expires_at text NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sign_in_links_token ON sign_in_links(token_hash)`,
  `CREATE TABLE IF NOT EXISTS friendships (
    id text PRIMARY KEY,
    requester_id text NOT NULL REFERENCES users(id),
    addressee_id text NOT NULL REFERENCES users(id),
    status text NOT NULL,
    created_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS games (
    engine_game_id text PRIMARY KEY,
    name text NOT NULL,
    designer_name text NOT NULL DEFAULT '',
    player_count text NOT NULL DEFAULT '',
    min_players integer NOT NULL DEFAULT 1,
    max_players integer NOT NULL DEFAULT 1,
    supports_ai integer NOT NULL DEFAULT 1,
    play_time text NOT NULL DEFAULT '',
    tags text NOT NULL DEFAULT '[]',
    cover_image text,
    description text NOT NULL DEFAULT '',
    rules_url text,
    visibility text NOT NULL DEFAULT 'public'
  )`,
  `CREATE TABLE IF NOT EXISTS game_updates (
    id text PRIMARY KEY,
    game_id text NOT NULL REFERENCES games(engine_game_id),
    title text NOT NULL,
    body text NOT NULL,
    posted_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tables (
    id text PRIMARY KEY,
    game_id text NOT NULL,
    host_user_id text REFERENCES users(id),
    host_guest_id text REFERENCES guests(id),
    mode text NOT NULL,
    status text NOT NULL DEFAULT 'lobby',
    engine_session_id text,
    encrypted_host_token text,
    options text NOT NULL DEFAULT '{}',
    setup_moves text,
    next_actor_position integer,
    result text,
    created_at text NOT NULL,
    finished_at text
  )`,
  `CREATE TABLE IF NOT EXISTS seats (
    id text PRIMARY KEY,
    table_id text NOT NULL REFERENCES tables(id),
    position integer NOT NULL,
    kind text NOT NULL,
    user_id text REFERENCES users(id),
    guest_id text REFERENCES guests(id),
    ai_difficulty text,
    engine_player_id text,
    ready integer NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS seats_table_position ON seats(table_id, position)`,
  `CREATE TABLE IF NOT EXISTS invites (
    id text PRIMARY KEY,
    table_id text NOT NULL REFERENCES tables(id),
    from_user_id text NOT NULL,
    to_user_id text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
  )`,
  `CREATE TABLE IF NOT EXISTS table_events (
    id text PRIMARY KEY,
    table_id text NOT NULL REFERENCES tables(id),
    seq integer NOT NULL,
    kind text NOT NULL,
    actor_seat_position integer,
    summary text NOT NULL DEFAULT '',
    engine_move text,
    payloads text NOT NULL DEFAULT '{}',
    next_actor_position integer,
    game_over text,
    rewind_to_seq integer,
    created_at text NOT NULL
  )`,
  // The unique index is what makes sequence numbers safe under concurrent
  // writers on Postgres: two writers computing the same MAX+1 cannot both
  // insert; the loser retries (see Realtime.appendEvent).
  `CREATE UNIQUE INDEX IF NOT EXISTS table_events_table_seq ON table_events(table_id, seq)`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    user_id text REFERENCES users(id),
    guest_id text REFERENCES guests(id),
    kind text NOT NULL,
    table_id text REFERENCES tables(id),
    read integer NOT NULL DEFAULT 0,
    created_at text NOT NULL,
    emailed_at text
  )`,
];

/** Statements that take a database from version N-1 to N. Both dialects
 *  must accept each one; the DDL above already describes the latest shape
 *  for a fresh database. */
const MIGRATIONS: Record<number, string[]> = {
  3: ['ALTER TABLE notifications ADD COLUMN emailed_at text'],
  4: ['ALTER TABLE tables ADD COLUMN setup_moves text'],
};

async function migrate(db: Kysely<DB>): Promise<void> {
  // A database from before the schema_version table exists cannot be
  // recreated in place; say so instead of failing on a missing column later.
  const existing = new Set((await db.introspection.getTables()).map((t) => t.name));
  if (existing.has('tables') && !existing.has('schema_version')) {
    throw new Error(
      'This database predates the current schema. Delete the local database file ' +
        '(or drop the Postgres schema) and restart.',
    );
  }
  for (const statement of TABLES) {
    await sql.raw(statement).execute(db);
  }
  const row = await db.selectFrom('schema_version').select('version').executeTakeFirst();
  if (!row) {
    await db.insertInto('schema_version').values({ version: SCHEMA_VERSION }).execute();
  } else if (row.version > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${row.version} is newer than this server's ${SCHEMA_VERSION}. ` +
        'Run the newer server, or delete the local database and restart.',
    );
  } else if (row.version < SCHEMA_VERSION) {
    for (let v = row.version + 1; v <= SCHEMA_VERSION; v++) {
      const steps = MIGRATIONS[v];
      if (!steps) {
        throw new Error(
          `Database schema version ${row.version} cannot be upgraded to ${SCHEMA_VERSION}. ` +
            'Delete the local database (or drop the Postgres schema) and restart.',
        );
      }
      for (const statement of steps) await sql.raw(statement).execute(db);
      await db.updateTable('schema_version').set({ version: v }).execute();
    }
  }
}

export async function createDatabase(databaseUrl: string): Promise<DatabaseClient> {
  const { dialect, target } = parseDatabaseUrl(databaseUrl);
  if (dialect === 'sqlite') {
    const sqlite = new Database(target);
    if (target !== ':memory:') sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) });
    await migrateOrClose(db);
    return { db, dialect, close: async () => { await db.destroy(); } };
  }
  const pool = new pg.Pool({ connectionString: target, max: 8 });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  await migrateOrClose(db);
  return { db, dialect, close: async () => { await db.destroy(); } };
}

/** A database that refuses to migrate must not stay open behind the error. */
async function migrateOrClose(db: Kysely<DB>): Promise<void> {
  try {
    await migrate(db);
  } catch (err) {
    await db.destroy().catch(() => undefined);
    throw err;
  }
}

/** True when an insert failed on a unique constraint, on either driver. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === '23505') return true; // postgres
  if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  return typeof e?.message === 'string' && /UNIQUE constraint failed/i.test(e.message);
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
