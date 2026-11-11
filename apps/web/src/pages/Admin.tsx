// The admin page (T06): one internal page that edits the storefront's rows.
// Games (name, blurb, play time, tags, cover, screenshots, designer, place
// among the featured, listed or not), designers' profiles, and the updates
// that show on home and on each game's devlog. Only an account in the
// server's ADMIN_EMAILS gets past the first request; the server checks every
// call, so this page hides nothing it relies on.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminContentResponse, AdminGameEdit, AdminMediaUpload, DesignerProfile, GameCatalogEntry, GameUpdate } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { playersLabel } from '../ui';

type Tab = 'games' | 'designers' | 'updates';
const IMAGE_TYPES: AdminMediaUpload['contentType'][] = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 1024 * 1024;

function message(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : (e as Error).message;
}

/** Read a picked file and upload it; resolves to its /media/ path. */
async function uploadFile(file: File): Promise<string> {
  const type = file.type as AdminMediaUpload['contentType'];
  if (!IMAGE_TYPES.includes(type)) throw new Error('Pick a PNG, JPEG or WebP image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 1 MB.`);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return (await api.admin.uploadImage({ contentType: type, data })).url;
}

/** An upload button that hands back the new image's path. */
function UploadButton({ label, onUploaded, onError }: { label: string; onUploaded: (url: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <label className="btn small secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: busy ? 'wait' : 'pointer' }}>
      {busy ? 'Uploading…' : label}
      <input
        type="file" accept={IMAGE_TYPES.join(',')} hidden disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try { onUploaded(await uploadFile(file)); } catch (err) { onError(message(err)); } finally { setBusy(false); }
        }}
      />
    </label>
  );
}

function Thumb({ src, wide }: { src: string | null; wide?: boolean }) {
  const style = { width: wide ? 120 : 72, height: wide ? 90 : 72, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--chip)', objectFit: 'cover' as const, flex: 'none' };
  return src ? <img src={src} alt="" style={style} /> : <span style={{ ...style, display: 'inline-block' }} />;
}

/** One image field: a preview, the path (editable, for files under /art/), and an upload. */
function ImageField({ label, value, onChange, onError, wide }: {
  label: string; value: string | null; onChange: (v: string | null) => void; onError: (m: string) => void; wide?: boolean;
}) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Thumb src={value} wide={wide} />
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={value ?? ''} placeholder="/art/... or upload"
          onChange={(e) => onChange(e.target.value.trim() || null)} />
        <UploadButton label="Upload" onUploaded={onChange} onError={onError} />
        {value && <button type="button" className="btn small secondary" onClick={() => onChange(null)}>Clear</button>}
      </div>
    </div>
  );
}

function Status({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (saving) return <span className="note">Saving…</span>;
  if (error) return <span className="error" role="alert" style={{ fontSize: 13 }}>{error}</span>;
  if (saved) return <span className="note" role="status">Saved. Players see it on their next page load.</span>;
  return null;
}

/** Saving state for one form: run() clears the last result and records the new one. */
function useSave() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>): Promise<boolean> => {
    setSaving(true); setSaved(false); setError(null);
    try { await fn(); setSaved(true); return true; } catch (e) { setError(message(e)); return false; } finally { setSaving(false); }
  }, []);
  const reset = useCallback(() => { setSaved(false); setError(null); }, []);
  return { saving, saved, error, setError, run, reset };
}

function ListButton({ current, onClick, children }: { current: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="card" aria-current={current || undefined}
      style={{ textAlign: 'left', padding: '10px 14px', cursor: 'pointer', font: 'inherit', color: 'inherit',
        background: current ? 'var(--accent-tint)' : 'var(--bg-raised)', borderColor: current ? 'var(--accent)' : undefined }}>
      {children}
    </button>
  );
}

// ---- games ----------------------------------------------------------------------

function toEdit(g: GameCatalogEntry): AdminGameEdit {
  return {
    name: g.name, description: g.description, playTime: g.playTime, tags: g.tags, coverImage: g.coverImage,
    coverFocus: g.coverFocus, screenshots: g.screenshots, designerSlug: g.designerSlug, featuredRank: g.featuredRank,
    visibility: g.visibility,
  };
}

function GameForm({ game, designers, onSaved }: { game: GameCatalogEntry; designers: DesignerProfile[]; onSaved: () => void }) {
  const [edit, setEdit] = useState<AdminGameEdit>(() => toEdit(game));
  const [tagsText, setTagsText] = useState(game.tags.join(', '));
  const save = useSave();
  const set = <K extends keyof AdminGameEdit>(k: K, v: AdminGameEdit[K]) => { setEdit((e) => ({ ...e, [k]: v })); save.reset(); };
  const shots = edit.screenshots;
  const moveShot = (i: number, d: -1 | 1) => {
    const next = [...shots];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s!);
    set('screenshots', next);
  };

  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
      if (await save.run(() => api.admin.saveGame(game.engineGameId, { ...edit, tags }))) onSaved();
    }}>
      <div className="row-head">
        <h2 style={{ fontSize: 22 }}>{game.name}</h2>
        <Link to={`/games/${game.engineGameId}`} className="note">Open the game page ›</Link>
      </div>
      <p className="note">
        From the engine, not edited here: {playersLabel(game.playerCount)}, {game.supportsAi ? 'plays against the AI' : 'no AI'}.
        Engine id <code>{game.engineGameId}</code>.
      </p>
      <label className="field"><span className="label">Name</span>
        <input value={edit.name} maxLength={80} required onChange={(e) => set('name', e.target.value)} /></label>
      <label className="field"><span className="label">Blurb</span>
        <textarea rows={4} value={edit.description} maxLength={1000} onChange={(e) => set('description', e.target.value)} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label className="field"><span className="label">Play time</span>
          <input value={edit.playTime} maxLength={40} placeholder="30–45 min" onChange={(e) => set('playTime', e.target.value)} /></label>
        <label className="field"><span className="label">Designer</span>
          <select value={edit.designerSlug ?? ''} onChange={(e) => set('designerSlug', e.target.value || null)}>
            <option value="">None</option>
            {designers.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select></label>
        <label className="field"><span className="label">Featured place</span>
          <input type="number" min={1} max={99} step={1} value={edit.featuredRank ?? ''} placeholder="Not featured"
            onChange={(e) => set('featuredRank', e.target.value === '' ? null : Number(e.target.value))} /></label>
        <label className="field"><span className="label">Listed</span>
          <select value={edit.visibility} onChange={(e) => set('visibility', e.target.value as AdminGameEdit['visibility'])}>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted (by link only)</option>
          </select></label>
      </div>
      <label className="field"><span className="label">Tags, separated by commas</span>
        <input value={tagsText} onChange={(e) => { setTagsText(e.target.value); save.reset(); }} placeholder="deck-building, duel" /></label>
      <ImageField label="Cover (square)" value={edit.coverImage} onChange={(v) => set('coverImage', v)} onError={save.setError} />
      <label className="field"><span className="label">Cover focus, where a wide crop keeps the cover's center</span>
        <input value={edit.coverFocus ?? ''} placeholder="50% 50%" onChange={(e) => set('coverFocus', e.target.value.trim() || null)} /></label>
      <div className="field">
        <span className="label">Screenshots, in order (at most 8)</span>
        {shots.length === 0 && <span className="note">None yet. The game page shows four empty slots until there is one.</span>}
        {shots.map((s, i) => (
          <div key={s + i} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Thumb src={s} wide />
            <code style={{ flex: 1, minWidth: 160, fontSize: 12, wordBreak: 'break-all' }}>{s}</code>
            <button type="button" className="btn small secondary" disabled={i === 0} onClick={() => moveShot(i, -1)} aria-label={`Move screenshot ${i + 1} up`}>↑</button>
            <button type="button" className="btn small secondary" disabled={i === shots.length - 1} onClick={() => moveShot(i, 1)} aria-label={`Move screenshot ${i + 1} down`}>↓</button>
            <button type="button" className="btn small secondary" onClick={() => set('screenshots', shots.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        {shots.length < 8 && (
          <div><UploadButton label="Add a screenshot" onUploaded={(url) => set('screenshots', [...shots, url])} onError={save.setError} /></div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={save.saving}>Save {game.name}</button>
        <Status {...save} />
      </div>
    </form>
  );
}

function GamesTab({ content, reload }: { content: AdminContentResponse; reload: () => void }) {
  const [id, setId] = useState(content.games[0]?.engineGameId ?? '');
  const game = content.games.find((g) => g.engineGameId === id);
  return (
    <div className="admin-split">
      <div className="stack" style={{ gap: 8 }}>
        {content.games.map((g) => (
          <ListButton key={g.engineGameId} current={g.engineGameId === id} onClick={() => setId(g.engineGameId)}>
            <div style={{ fontWeight: 600 }}>{g.name}</div>
            <div className="note">
              {g.featuredRank !== null ? `Featured ${g.featuredRank}` : 'Not featured'}
              {g.visibility === 'unlisted' ? ' · unlisted' : ''}
              {` · ${g.screenshots.length} screenshot${g.screenshots.length === 1 ? '' : 's'}`}
            </div>
          </ListButton>
        ))}
      </div>
      {/* keyed by the row, so picking another starts its form fresh while a
          reload after saving keeps the form and its Saved line */}
      {game ? <GameForm key={game.engineGameId} game={game} designers={content.designers} onSaved={reload} /> : <p className="muted">No games yet.</p>}
    </div>
  );
}

// ---- designers ----------------------------------------------------------------

function DesignerForm({ designer, onSaved }: { designer: DesignerProfile | null; onSaved: (slug: string) => void }) {
  const blank = { slug: '', name: '', bio: '', avatarImage: null as string | null };
  const [d, setD] = useState(designer ?? blank);
  const save = useSave();
  const set = (patch: Partial<typeof d>) => { setD((x) => ({ ...x, ...patch })); save.reset(); };
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      const body = { name: d.name, bio: d.bio, avatarImage: d.avatarImage };
      const ok = await save.run(() => designer ? api.admin.saveDesigner(designer.slug, body) : api.admin.createDesigner({ ...body, slug: d.slug }));
      if (ok) onSaved(designer ? designer.slug : d.slug);
    }}>
      <h2 style={{ fontSize: 22 }}>{designer ? designer.name : 'New designer'}</h2>
      {designer
        ? <p className="note">Profile at <Link to={`/designers/${designer.slug}`}>/designers/{designer.slug}</Link>. The address does not change.</p>
        : (
          <label className="field"><span className="label">Address on the site, lower case with hyphens (it cannot change later)</span>
            <input value={d.slug} maxLength={40} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="river-works"
              onChange={(e) => set({ slug: e.target.value })} /></label>
        )}
      <label className="field"><span className="label">Name</span>
        <input value={d.name} maxLength={80} required onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="field"><span className="label">Bio</span>
        <textarea rows={4} value={d.bio} maxLength={1000} onChange={(e) => set({ bio: e.target.value })} /></label>
      <ImageField label="Portrait (square; the initial shows without one)" value={d.avatarImage} onChange={(v) => set({ avatarImage: v })} onError={save.setError} />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={save.saving}>{designer ? 'Save' : 'Add designer'}</button>
        <Status {...save} />
      </div>
    </form>
  );
}

function DesignersTab({ content, reload }: { content: AdminContentResponse; reload: () => void }) {
  const [slug, setSlug] = useState<string | null>(content.designers[0]?.slug ?? null);
  const designer = content.designers.find((d) => d.slug === slug) ?? null;
  return (
    <div className="admin-split">
      <div className="stack" style={{ gap: 8 }}>
        {content.designers.map((d) => (
          <ListButton key={d.slug} current={d.slug === slug} onClick={() => setSlug(d.slug)}>
            <div style={{ fontWeight: 600 }}>{d.name}</div>
            <div className="note">{content.games.filter((g) => g.designerSlug === d.slug).length} games</div>
          </ListButton>
        ))}
        <ListButton current={slug === null} onClick={() => setSlug(null)}><div style={{ fontWeight: 600 }}>+ New designer</div></ListButton>
      </div>
      <DesignerForm key={designer?.slug ?? 'new'} designer={designer} onSaved={(s) => { setSlug(s); reload(); }} />
    </div>
  );
}

// ---- updates --------------------------------------------------------------------

/** An ISO time as the value a datetime-local input takes, in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function UpdateForm({ update, games, onDone, onCancel }: {
  update: GameUpdate | null; games: GameCatalogEntry[]; onDone: () => void; onCancel?: () => void;
}) {
  const [gameId, setGameId] = useState(update?.gameId ?? games[0]?.engineGameId ?? '');
  const [title, setTitle] = useState(update?.title ?? '');
  const [body, setBody] = useState(update?.body ?? '');
  const [postedAt, setPostedAt] = useState(update ? toLocalInput(update.postedAt) : '');
  const save = useSave();
  return (
    <form className="card stack" style={{ padding: 18 }} onSubmit={async (e) => {
      e.preventDefault();
      const edit = { gameId, title, body, postedAt: postedAt ? new Date(postedAt).toISOString() : undefined };
      const ok = await save.run(() => update ? api.admin.saveUpdate(update.id, edit) : api.admin.createUpdate(edit));
      if (ok) {
        if (!update) { setTitle(''); setBody(''); setPostedAt(''); }
        onDone();
      }
    }}>
      {!update && <h2 style={{ fontSize: 20 }}>Post an update</h2>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <label className="field"><span className="label">Game</span>
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {games.map((g) => <option key={g.engineGameId} value={g.engineGameId}>{g.name}</option>)}
          </select></label>
        <label className="field"><span className="label">Posted at{update ? '' : ' (empty: now)'}</span>
          <input type="datetime-local" value={postedAt} onChange={(e) => setPostedAt(e.target.value)} /></label>
      </div>
      <label className="field"><span className="label">Title</span>
        <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span className="label">Text</span>
        <textarea rows={4} value={body} maxLength={4000} required onChange={(e) => setBody(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="submit" className="btn" disabled={save.saving}>{update ? 'Save' : 'Post'}</button>
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>}
        <Status {...save} />
      </div>
    </form>
  );
}

function UpdatesTab({ content, reload }: { content: AdminContentResponse; reload: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack loose">
      <UpdateForm update={null} games={content.games} onDone={reload} />
      <section className="stack">
        <h2 style={{ fontSize: 20 }}>Posted, newest first</h2>
        <p className="note">These show in the Updates column on home and on each game's page.</p>
        {error && <p className="error" role="alert">{error}</p>}
        {content.updates.length === 0 && <p className="muted">No updates yet.</p>}
        {content.updates.map((u) => editing === u.id
          ? <UpdateForm key={u.id} update={u} games={content.games} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
          : (
            <article key={u.id} className="card" style={{ padding: '14px 18px' }}>
              <div className="note">{u.gameName} · {new Date(u.postedAt).toLocaleString()}</div>
              <div style={{ fontWeight: 600, margin: '4px 0' }}>{u.title}</div>
              <p style={{ margin: '0 0 10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{u.body}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn small secondary" onClick={() => setEditing(u.id)}>Edit</button>
                <button type="button" className="btn small secondary" onClick={async () => {
                  if (!window.confirm(`Remove "${u.title}"? It leaves home and the game's page.`)) return;
                  try { await api.admin.removeUpdate(u.id); setError(null); reload(); } catch (e) { setError(message(e)); }
                }}>Remove</button>
              </div>
            </article>
          ))}
      </section>
    </div>
  );
}

// ---- the page ---------------------------------------------------------------------

export function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>('games');
  const [content, setContent] = useState<AdminContentResponse | null>(null);
  const [err, setErr] = useState<{ status: number; text: string } | null>(null);

  const load = useCallback(() => {
    api.admin.content().then((c) => { setContent(c); setErr(null); })
      .catch((e) => setErr({ status: e instanceof ApiRequestError ? e.status : 0, text: message(e) }));
  }, []);
  useEffect(() => { if (!session.loading) load(); }, [session.loading, session.me, load]);

  const tabs = useMemo(() => ([
    ['games', `Games${content ? ` (${content.games.length})` : ''}`],
    ['designers', `Designers${content ? ` (${content.designers.length})` : ''}`],
    ['updates', `Updates${content ? ` (${content.updates.length})` : ''}`],
  ] as Array<[Tab, string]>), [content]);

  let body: ReactNode;
  if (err?.status === 401) {
    body = <p>Sign in with an admin account to use this page. <Link to="/signin?next=%2Fadmin">Sign in</Link></p>;
  } else if (err?.status === 403) {
    body = <p className="muted">This account is not an admin. Admins are the accounts listed in the server's ADMIN_EMAILS setting.</p>;
  } else if (err) {
    body = <p className="error">{err.text}</p>;
  } else if (!content) {
    body = <p className="muted">Loading…</p>;
  } else {
    body = (
      <>
        <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tabs.map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t}
              className={`btn small${tab === t ? '' : ' secondary'}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
        {tab === 'games' && <GamesTab content={content} reload={load} />}
        {tab === 'designers' && <DesignersTab content={content} reload={load} />}
        {tab === 'updates' && <UpdatesTab content={content} reload={load} />}
      </>
    );
  }

  return (
    <div>
      <Nav />
      <div className="page stack loose" style={{ maxWidth: 1180 }}>
        <div>
          <h1>Admin</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Edits here change what every player sees on the storefront. Rules, player counts and AI support come from the engine and are not edited here.
          </p>
        </div>
        {body}
      </div>
    </div>
  );
}
