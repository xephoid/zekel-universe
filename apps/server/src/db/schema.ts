// Database schema. Written against Drizzle's SQLite dialect so local
// development runs on better-sqlite3. Column types are chosen to map onto
// Postgres types (text, integer, boolean, json, timestamp) so a pg-backed
// schema file can be generated from the same definitions when the production
// driver is swapped in by config.

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  createdAt: text('created_at').notNull(),
});

export const identities = sqliteTable('identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(), // 'email', later 'google', 'github', ...
  providerSubject: text('provider_subject').notNull(), // e.g. the email address
});

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(), // sha256 of the cookie token
  createdAt: text('created_at').notNull(),
});

export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull(), // sha256 of the cookie token
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  upgradedToUserId: text('upgraded_to_user_id').references(() => users.id),
});

export const friendships = sqliteTable('friendships', {
  id: text('id').primaryKey(),
  requesterId: text('requester_id').notNull().references(() => users.id),
  addresseeId: text('addressee_id').notNull().references(() => users.id),
  status: text('status').notNull(), // 'pending' | 'accepted'
  createdAt: text('created_at').notNull(),
});

export const games = sqliteTable('games', {
  engineGameId: text('engine_game_id').primaryKey(),
  name: text('name').notNull(),
  designerName: text('designer_name').notNull().default(''),
  playerCount: text('player_count').notNull().default(''),
  playTime: text('play_time').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  coverImage: text('cover_image'),
  description: text('description').notNull().default(''),
  rulesUrl: text('rules_url'),
  visibility: text('visibility').notNull().default('public'), // 'public' | 'unlisted'
});

export const gameUpdates = sqliteTable('game_updates', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.engineGameId),
  title: text('title').notNull(),
  body: text('body').notNull(),
  postedAt: text('posted_at').notNull(),
});

export const tables = sqliteTable('tables', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull(),
  hostUserId: text('host_user_id'),
  hostGuestId: text('host_guest_id'),
  mode: text('mode').notNull(), // 'live' | 'turns'
  status: text('status').notNull().default('lobby'), // 'lobby' | 'playing' | 'finished'
  engineSessionId: text('engine_session_id'),
  encryptedHostToken: text('encrypted_host_token'),
  createdAt: text('created_at').notNull(),
  finishedAt: text('finished_at'),
});

export const seats = sqliteTable('seats', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id),
  position: integer('position').notNull(),
  kind: text('kind').notNull(), // 'human' | 'ai'
  userId: text('user_id'),
  guestId: text('guest_id'),
  aiDifficulty: text('ai_difficulty'),
  enginePlayerId: text('engine_player_id'),
  setupChoices: text('setup_choices', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  ready: integer('ready', { mode: 'boolean' }).notNull().default(false),
});

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id),
  fromUserId: text('from_user_id').notNull(),
  toUserId: text('to_user_id').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
});

export const tableEvents = sqliteTable('table_events', {
  id: text('id').primaryKey(),
  tableId: text('table_id').notNull().references(() => tables.id),
  seq: integer('seq').notNull(),
  kind: text('kind').notNull(), // 'setup' | 'move' | 'ai_move' | 'roll' | 'draw' | 'system'
  actorSeatPosition: integer('actor_seat_position'),
  summary: text('summary').notNull().default(''),
  engineMove: text('engine_move', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  views: text('views', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text('created_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  guestId: text('guest_id'),
  kind: text('kind').notNull(), // 'your_turn' | 'invite' | 'table_finished'
  tableId: text('table_id').references(() => tables.id),
  read: integer('read', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});
