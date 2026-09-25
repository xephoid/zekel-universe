// Database URL parsing on every documented form, the schema on SQLite, and
// the same schema plus the sequence-number race on Postgres when
// TEST_DATABASE_URL points at one (docker compose brings one up).

import { describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createDatabase, parseDatabaseUrl, SCHEMA_VERSION } from './db/index.js';
import { FakeEngine } from './test-engine.js';
import { TableService } from './tables/service.js';
import { Realtime } from './realtime.js';
import { ConsoleMailer } from './email.js';

describe('parseDatabaseUrl', () => {
  it('accepts every documented SQLite form', () => {
    expect(parseDatabaseUrl(':memory:')).toEqual({ dialect: 'sqlite', target: ':memory:' });
    expect(parseDatabaseUrl('sqlite::memory:')).toEqual({ dialect: 'sqlite', target: ':memory:' });
    expect(parseDatabaseUrl('sqlite:./dev.db')).toEqual({ dialect: 'sqlite', target: './dev.db' });
    expect(parseDatabaseUrl('sqlite:/data/dev.db')).toEqual({ dialect: 'sqlite', target: '/data/dev.db' });
    expect(parseDatabaseUrl('sqlite://dev.db')).toEqual({ dialect: 'sqlite', target: 'dev.db' });
    expect(parseDatabaseUrl('sqlite:///data/dev.db')).toEqual({ dialect: 'sqlite', target: '/data/dev.db' });
  });
  it('accepts Postgres and refuses the rest', () => {
    expect(parseDatabaseUrl('postgres://u:p@h:5432/db').dialect).toBe('postgres');
    expect(parseDatabaseUrl('postgresql://u:p@h:5432/db').dialect).toBe('postgres');
    expect(() => parseDatabaseUrl('mysql://x')).toThrow(/Unsupported/);
    expect(() => parseDatabaseUrl('sqlite:')).toThrow();
  });
});

describe('schema migration', () => {
  it('upgrades a version 2 database in place and refuses a newer one', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'universe-db-'));
    const file = path.join(dir, 'v2.db');
    // A version 2 database: notifications without emailed_at.
    const raw = new Database(file);
    raw.exec(`CREATE TABLE schema_version (version integer NOT NULL);
      INSERT INTO schema_version VALUES (2);
      CREATE TABLE tables (id text PRIMARY KEY);
      CREATE TABLE notifications (id text PRIMARY KEY, user_id text, guest_id text, kind text NOT NULL,
        table_id text, read integer NOT NULL DEFAULT 0, created_at text NOT NULL);
      INSERT INTO notifications (id, kind, created_at) VALUES ('n1', 'your_turn', 'then');`);
    raw.close();

    const upgraded = await createDatabase(`sqlite:${file}`);
    try {
      const row = await upgraded.db.selectFrom('notifications').selectAll().where('id', '=', 'n1').executeTakeFirst();
      expect(row?.emailed_at).toBeNull();
      await upgraded.db.updateTable('notifications').set({ emailed_at: 'now' }).where('id', '=', 'n1').execute();
      expect((await upgraded.db.selectFrom('schema_version').select('version').executeTakeFirst())?.version).toBe(SCHEMA_VERSION);
    } finally {
      await upgraded.close();
    }

    // Opening it again is a no-op; a database from the future is refused.
    const again = await createDatabase(`sqlite:${file}`);
    await again.db.updateTable('schema_version').set({ version: SCHEMA_VERSION + 1 }).execute();
    await again.close();
    await expect(createDatabase(`sqlite:${file}`)).rejects.toThrow(/newer/);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });
});

describe('schema 5', () => {
  it('adds the log column to an existing events table, keeping its rows', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'universe-db-'));
    const file = path.join(dir, 'v4.db');
    const raw = new Database(file);
    raw.exec(`CREATE TABLE schema_version (version integer NOT NULL);
      INSERT INTO schema_version VALUES (4);
      CREATE TABLE tables (id text PRIMARY KEY, setup_moves text);
      CREATE TABLE notifications (id text PRIMARY KEY, user_id text, guest_id text, kind text NOT NULL,
        table_id text, read integer NOT NULL DEFAULT 0, created_at text NOT NULL, emailed_at text);
      CREATE TABLE table_events (id text PRIMARY KEY, table_id text NOT NULL, seq integer NOT NULL, kind text NOT NULL,
        actor_seat_position integer, summary text NOT NULL DEFAULT '', engine_move text, payloads text NOT NULL DEFAULT '{}',
        next_actor_position integer, game_over text, rewind_to_seq integer, created_at text NOT NULL);
      INSERT INTO tables (id) VALUES ('t1');
      INSERT INTO table_events (id, table_id, seq, kind, created_at) VALUES ('e1', 't1', 1, 'setup', 'then');`);
    raw.close();
    const upgraded = await createDatabase(`sqlite:${file}`);
    try {
      const row = await upgraded.db.selectFrom('table_events').selectAll().where('id', '=', 'e1').executeTakeFirst();
      expect(row?.log_entries).toBe('[]');
      expect((await upgraded.db.selectFrom('schema_version').select('version').executeTakeFirst())?.version).toBe(SCHEMA_VERSION);
    } finally {
      await upgraded.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });
});

const PG = process.env.TEST_DATABASE_URL;

describe.skipIf(!PG)('postgres', () => {
  it('runs the schema, a full move flow, and keeps sequence numbers unique under concurrent writers', async () => {
    const database = await createDatabase(PG!);
    const { db } = database;
    // Fresh tables for this run.
    for (const t of ['notifications', 'table_events', 'invites', 'seats', 'tables', 'game_updates', 'games', 'friendships', 'sign_in_links', 'guests', 'auth_sessions', 'identities', 'users', 'schema_version']) {
      await sql.raw(`DROP TABLE IF EXISTS ${t} CASCADE`).execute(db);
    }
    await database.close();
    const fresh = await createDatabase(PG!);
    try {
      const engine = new FakeEngine();
      const tables = new TableService(fresh.db, engine, 'secret');
      const realtime = new Realtime(fresh.db, engine, tables, new ConsoleMailer());
      await fresh.db.insertInto('users').values({ id: 'u', display_name: 'u', avatar_url: null, bio: null, created_at: 'now' }).execute();
      await fresh.db.insertInto('games').values({
        engine_game_id: 'fractured-fist', name: 'FF', designer_name: '', player_count: '2', min_players: 2, max_players: 2,
        supports_ai: 1, play_time: '', tags: '[]', cover_image: null, description: '', rules_url: null, visibility: 'public',
      }).execute();
      const { tableId } = await tables.createTable({ kind: 'user', userId: 'u' }, {
        gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
      });
      await realtime.handleMove({ kind: 'user', userId: 'u' }, tableId, 0, { type: 'pass' });
      const before = await realtime.eventsAfter(tableId, 0);
      expect(before.map((e) => e.seq)).toEqual([1, 2, 3, 4]);

      // Twenty concurrent appends must produce twenty distinct numbers.
      await Promise.all(Array.from({ length: 20 }, (_, i) => realtime.appendEvent(tableId, {
        kind: 'system', actorSeatPosition: null, summary: `s${i}`, engineMove: null, payloads: {},
        nextActorPosition: null, gameOver: null, rewindToSeq: null,
      })));
      const after = await realtime.eventsAfter(tableId, 0);
      const seqs = after.map((e) => e.seq);
      expect(new Set(seqs).size).toBe(24);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    } finally {
      await fresh.close();
    }
  });
});
