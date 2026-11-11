// The admin page's API (T06; the approach is D3: plain edits to the
// storefront's database rows from one small internal page). It edits what a
// player reads on the storefront: a game's name, copy, cover, screenshots,
// designer, place among the featured, and whether it is listed; the
// designers' profiles; the designers' updates (the home feed and each game's
// devlog); and the images those point at.
//
// Who may use it: a signed-in account whose sign-in email is in the server's
// ADMIN_EMAILS. Every route checks, on every request. Nothing here touches a
// rule: the player counts and AI support stay the engine's.
//
// Images are uploaded here and kept in the database, served from
// /media/<id>. The page's security policy allows same-site images only, and
// the host's disk does not survive a deploy, so neither an outside link nor a
// file on disk would work.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type {
  AdminContentResponse, AdminDesignerEdit, AdminGameEdit, AdminMediaResponse, AdminMediaUpload, AdminUpdateEdit,
  DesignerProfile, GameCatalogEntry, GameUpdate } from '@universe/shared';
import type { DB } from './db/schema.js';
import { newId, now, type Principal } from './identity.js';

type HttpErrorClass = new (statusCode: number, code: string, message?: string) => Error;

export interface AdminDeps {
  db: Kysely<DB>;
  adminEmails: string[];
  principalOf: (req: FastifyRequest) => Promise<Principal | null>;
  catalog: () => Promise<GameCatalogEntry[]>;
  listAllUpdates: () => Promise<GameUpdate[]>;
  designerProfile: (d: DB['designers']) => DesignerProfile;
  HttpError: HttpErrorClass;
}

/** Is this account's sign-in email one of the admin emails? */
export async function isAdminUser(db: Kysely<DB>, adminEmails: string[], userId: string): Promise<boolean> {
  if (adminEmails.length === 0) return false;
  const rows = await db.selectFrom('identities').select('provider_subject')
    .where('user_id', '=', userId).where('provider', '=', 'email').execute();
  return rows.some((r) => adminEmails.includes(r.provider_subject.toLowerCase()));
}

/** ADMIN_EMAILS: comma- or space-separated, compared in lower case. */
export function parseAdminEmails(raw: string | undefined): string[] {
  return [...new Set((raw ?? '').split(/[\s,]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))];
}

// ---- limits and checks --------------------------------------------------------

export const MEDIA_MAX_BYTES = 1024 * 1024;
const MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** An image the site serves itself: a file under /art/ or an upload under /media/. */
const IMAGE_PATH = /^\/(art|media)\/[A-Za-z0-9_-][A-Za-z0-9._/-]{0,180}$/;
const COVER_FOCUS = /^\d{1,3}% \d{1,3}%$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Does the data start the way its claimed type starts? */
function looksLike(type: AdminMediaUpload['contentType'], b: Buffer): boolean {
  if (type === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}

export function registerAdmin(app: FastifyInstance, deps: AdminDeps): void {
  const { db, HttpError } = deps;
  const bad = (code: string, message: string) => new HttpError(400, code, message);

  async function requireAdmin(req: FastifyRequest): Promise<string> {
    const p = await deps.principalOf(req);
    if (!p || p.kind !== 'user') throw new HttpError(401, 'sign_in_required', 'Sign in with an admin account first.');
    if (!(await isAdminUser(db, deps.adminEmails, p.userId))) throw new HttpError(403, 'not_admin', 'This account is not an admin.');
    return p.userId;
  }

  function text(v: unknown, field: string, min: number, max: number): string {
    if (typeof v !== 'string') throw bad('invalid_field', `${field} must be text.`);
    const t = v.trim();
    if (t.length < min) throw bad('invalid_field', `${field} is required.`);
    if (t.length > max) throw bad('invalid_field', `${field} is longer than ${max} characters.`);
    return t;
  }

  function image(v: unknown, field: string): string | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || !IMAGE_PATH.test(v) || v.includes('..') || v.includes('//')) {
      throw bad('invalid_image', `${field} must be a path on this site, under /art/ or /media/.`);
    }
    return v;
  }

  async function designerExists(slug: string): Promise<boolean> {
    return !!(await db.selectFrom('designers').select('slug').where('slug', '=', slug).executeTakeFirst());
  }

  function audit(req: FastifyRequest, adminId: string, action: string, target: string): void {
    req.log.info({ adminUserId: adminId, action, target }, 'admin edit');
  }

  // ---- reading ----------------------------------------------------------------

  app.get('/api/admin/content', async (req): Promise<AdminContentResponse> => {
    await requireAdmin(req);
    const [games, designers, updates] = await Promise.all([
      deps.catalog(),
      db.selectFrom('designers').selectAll().orderBy('name', 'asc').execute(),
      deps.listAllUpdates(),
    ]);
    return { games, designers: designers.map(deps.designerProfile), updates };
  });

  // ---- games --------------------------------------------------------------------

  app.put('/api/admin/games/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const { id } = req.params as { id: string };
    const row = await db.selectFrom('games').select('engine_game_id').where('engine_game_id', '=', id).executeTakeFirst();
    if (!row) throw new HttpError(404, 'no_game');
    const b = (req.body ?? {}) as Partial<AdminGameEdit>;

    const name = text(b.name, 'Name', 1, 80);
    const description = text(b.description ?? '', 'Blurb', 0, 1000);
    const playTime = text(b.playTime ?? '', 'Play time', 0, 40);
    if (!Array.isArray(b.tags) || b.tags.length > 8) throw bad('invalid_field', 'Tags must be a list of at most 8.');
    const tags = b.tags.map((t) => text(t, 'A tag', 1, 30));
    const coverImage = image(b.coverImage, 'Cover');
    const coverFocus = b.coverFocus == null || b.coverFocus === '' ? null : String(b.coverFocus).trim();
    if (coverFocus !== null && !COVER_FOCUS.test(coverFocus)) throw bad('invalid_field', 'Cover focus looks like "50% 18%".');
    if (!Array.isArray(b.screenshots) || b.screenshots.length > 8) throw bad('invalid_field', 'Screenshots must be a list of at most 8.');
    const screenshots = b.screenshots.map((s) => image(s, 'A screenshot')).filter((s): s is string => s !== null);
    let designerSlug: string | null = null;
    let designerName = '';
    if (b.designerSlug != null && b.designerSlug !== '') {
      const d = await db.selectFrom('designers').select(['slug', 'name']).where('slug', '=', String(b.designerSlug)).executeTakeFirst();
      if (!d) throw bad('no_designer', 'That designer does not exist.');
      designerSlug = d.slug;
      designerName = d.name;
    }
    const rank = b.featuredRank;
    if (rank !== null && rank !== undefined && !(Number.isInteger(rank) && rank >= 1 && rank <= 99)) {
      throw bad('invalid_field', 'Featured place is a whole number from 1 to 99, or empty.');
    }
    if (b.visibility !== 'public' && b.visibility !== 'unlisted') throw bad('invalid_field', 'Visibility is public or unlisted.');

    await db.updateTable('games').set({
      name, description, play_time: playTime, tags: JSON.stringify(tags),
      cover_image: coverImage, cover_focus: coverFocus, screenshots: JSON.stringify(screenshots),
      designer_slug: designerSlug, designer_name: designerName,
      featured_rank: rank ?? null, visibility: b.visibility,
    }).where('engine_game_id', '=', id).execute();
    audit(req, adminId, 'game.update', id);
    return { ok: true };
  });

  // ---- designers ---------------------------------------------------------------

  function designerFields(b: Partial<AdminDesignerEdit>) {
    return {
      name: text(b.name, 'Name', 1, 80),
      bio: text(b.bio ?? '', 'Bio', 0, 1000),
      avatar_image: image(b.avatarImage, 'Portrait'),
    };
  }

  app.post('/api/admin/designers', async (req) => {
    const adminId = await requireAdmin(req);
    const b = (req.body ?? {}) as Partial<AdminDesignerEdit>;
    const slug = text(b.slug, 'Slug', 1, 40);
    if (!SLUG.test(slug)) throw bad('invalid_field', 'Slug is lower-case letters, digits and single hyphens, like "zekel-games".');
    if (await designerExists(slug)) throw new HttpError(409, 'designer_exists', 'A designer with that slug exists.');
    await db.insertInto('designers').values({ slug, ...designerFields(b) }).execute();
    audit(req, adminId, 'designer.create', slug);
    return { ok: true, slug };
  });

  app.put('/api/admin/designers/:slug', async (req) => {
    const adminId = await requireAdmin(req);
    const { slug } = req.params as { slug: string };
    if (!(await designerExists(slug))) throw new HttpError(404, 'no_designer');
    const fields = designerFields((req.body ?? {}) as Partial<AdminDesignerEdit>);
    await db.transaction().execute(async (trx) => {
      await trx.updateTable('designers').set(fields).where('slug', '=', slug).execute();
      await trx.updateTable('games').set({ designer_name: fields.name }).where('designer_slug', '=', slug).execute();
    });
    audit(req, adminId, 'designer.update', slug);
    return { ok: true };
  });

  // ---- updates (the news on home and each game's devlog) ----------------------

  async function updateFields(b: Partial<AdminUpdateEdit>, fallbackPostedAt: string) {
    const gameId = text(b.gameId, 'Game', 1, 80);
    const g = await db.selectFrom('games').select('engine_game_id').where('engine_game_id', '=', gameId).executeTakeFirst();
    if (!g) throw bad('no_game', 'That game does not exist.');
    let postedAt = fallbackPostedAt;
    if (b.postedAt !== undefined && b.postedAt !== '') {
      const t = Date.parse(String(b.postedAt));
      if (Number.isNaN(t)) throw bad('invalid_field', 'Posted at is not a date.');
      postedAt = new Date(t).toISOString();
    }
    return { game_id: gameId, title: text(b.title, 'Title', 1, 120), body: text(b.body, 'Text', 1, 4000), posted_at: postedAt };
  }

  app.post('/api/admin/updates', async (req) => {
    const adminId = await requireAdmin(req);
    const fields = await updateFields((req.body ?? {}) as Partial<AdminUpdateEdit>, now());
    const id = newId();
    await db.insertInto('game_updates').values({ id, ...fields }).execute();
    audit(req, adminId, 'update.create', id);
    return { ok: true, id };
  });

  async function liveUpdate(id: string) {
    const row = await db.selectFrom('game_updates').select(['id', 'posted_at', 'deleted_at']).where('id', '=', id).executeTakeFirst();
    if (!row || row.deleted_at) throw new HttpError(404, 'no_update');
    return row;
  }

  app.put('/api/admin/updates/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const { id } = req.params as { id: string };
    const row = await liveUpdate(id);
    const fields = await updateFields((req.body ?? {}) as Partial<AdminUpdateEdit>, row.posted_at);
    await db.updateTable('game_updates').set(fields).where('id', '=', id).execute();
    audit(req, adminId, 'update.update', id);
    return { ok: true };
  });

  // Removing an update hides it and keeps the row, so the seed in
  // storefront.ts never posts it again.
  app.delete('/api/admin/updates/:id', async (req) => {
    const adminId = await requireAdmin(req);
    const { id } = req.params as { id: string };
    await liveUpdate(id);
    await db.updateTable('game_updates').set({ deleted_at: now() }).where('id', '=', id).execute();
    audit(req, adminId, 'update.remove', id);
    return { ok: true };
  });

  // ---- images -------------------------------------------------------------------

  app.post('/api/admin/media', { bodyLimit: Math.ceil(MEDIA_MAX_BYTES * 1.4) + 1024 }, async (req): Promise<AdminMediaResponse> => {
    const adminId = await requireAdmin(req);
    const b = (req.body ?? {}) as Partial<AdminMediaUpload>;
    const type = b.contentType;
    if (!type || !(MEDIA_TYPES as readonly string[]).includes(type)) throw bad('invalid_media', 'Upload a PNG, JPEG or WebP image.');
    if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)) throw bad('invalid_media', 'The image data is not base64.');
    const bytes = Buffer.from(b.data, 'base64');
    if (bytes.length > MEDIA_MAX_BYTES) throw bad('media_too_large', 'Images are at most 1 MB.');
    if (!looksLike(type, bytes)) throw bad('invalid_media', `That file is not a ${type.slice(6).toUpperCase()} image.`);
    const id = newId();
    await db.insertInto('media').values({
      id, content_type: type, data: bytes.toString('base64'), byte_size: bytes.length, uploaded_by: adminId, created_at: now(),
    }).execute();
    audit(req, adminId, 'media.upload', id);
    return { url: `/media/${id}` };
  });

  // Public: an uploaded image never changes, so it may be cached for good.
  app.get('/media/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!MEDIA_ID.test(id)) throw new HttpError(404, 'not_found');
    const row = await db.selectFrom('media').select(['content_type', 'data']).where('id', '=', id).executeTakeFirst();
    if (!row) throw new HttpError(404, 'not_found');
    void reply.header('content-type', row.content_type);
    void reply.header('cache-control', 'public, max-age=31536000, immutable');
    void reply.header('content-disposition', 'inline');
    return reply.send(Buffer.from(row.data, 'base64'));
  });
}
