// The REST client. Every call is typed by the shared wire contract, so a
// response shape the server changes fails to compile here.

import { track } from './analytics';
import type {
  ApiError, CreateTableRequest, CreateTableResponse, FriendsResponse, GameReferenceResponse, GameResponse, GamesResponse,
  InvitesResponse, MeResponse, MyTablesResponse, TableEventsResponse, TableResponse, UpdatesResponse, DesignerResponse, DesignersResponse, WatchResponse,
  AdminContentResponse, AdminDesignerEdit, AdminGameEdit, AdminMediaResponse, AdminMediaUpload, AdminUpdateEdit } from '@universe/shared';

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  // The JSON content type goes only with a body: a bodiless POST with that
  // header is a malformed request to the server.
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let body: ApiError | null = null;
    try { body = (await res.json()) as ApiError; } catch { /* not json */ }
    throw new ApiRequestError(res.status, body?.error ?? 'request_failed', body?.message ?? `${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

/** Send an app event once a call has succeeded; the answer passes through. */
async function after<T>(call: Promise<T>, record: (res: T) => void): Promise<T> {
  const res = await call;
  record(res);
  return res;
}

function createTable(body: CreateTableRequest): Promise<CreateTableResponse> {
  return after(post<CreateTableResponse>('/api/tables', body), (res) => {
    const props = {
      game: body.gameId,
      mode: body.mode,
      seats: body.seats.length,
      ai_seats: body.seats.filter((s) => s.kind === 'ai').length,
      table_id: res.tableId,
    };
    track('table_created', props);
    // A table with no one to wait for starts at once; a lobby starts later.
    if (res.status !== 'lobby') track('game_started', props);
  });
}

export const api = {
  me: () => req<MeResponse>('/api/me'),
  createGuest: () => after(post<{ guest: MeResponse['guest'] }>('/api/guests'), () => track('guest_started')),
  updateMe: (displayName: string, bio?: string) => req<{ ok: true }>('/api/me', { method: 'PATCH', body: JSON.stringify({ displayName, bio }) }),
  signInEmail: (email: string) => after(post<{ ok: true }>('/api/auth/email/link', { email }), () => track('sign_in_link_requested', { method: 'email' })),
  completeSignIn: (token: string) => after(post<{ ok: true; userId: string }>('/api/auth/email/complete', { token }), () => track('signed_in', { method: 'email' })),
  /** Was this browser's current session made by this sign-in link? Changes nothing. */
  signInLinkStatus: (token: string) => post<{ signedIn: boolean; userId?: string }>('/api/auth/email/link-status', { token }),
  signOut: () => after(post<{ ok: true }>('/api/auth/signout'), () => track('signed_out')),
  /** Other ways to sign in this server offers (Discord and Google, through Supabase). */
  authProviders: () => req<{ providers: Array<'discord' | 'google'> }>('/api/auth/providers'),
  /** Start a Discord or Google sign-in: the server keeps its secret in a cookie and answers where to go. */
  startSupabaseSignIn: (provider: 'discord' | 'google') =>
    after(post<{ url: string }>('/api/auth/supabase/start', { provider }), () => track('sign_in_started', { method: provider })),
  /** Hand the server the one-time code Discord or Google sent back. Safe to
   *  send again from the same browser: a code that already signed it in
   *  gives that same session back. */
  completeSupabaseSignIn: (code: string) =>
    after(post<{ ok: true; userId: string }>('/api/auth/supabase/complete', { code }), () => track('signed_in', { method: 'oauth' })),

  games: () => req<GamesResponse>('/api/games'),
  game: (id: string) => req<GameResponse>(`/api/games/${encodeURIComponent(id)}`),
  reference: (id: string) => req<GameReferenceResponse>(`/api/games/${encodeURIComponent(id)}/reference`),
  updates: (limit = 20) => req<UpdatesResponse>(`/api/updates?limit=${limit}`),
  gameUpdates: (id: string) => req<UpdatesResponse>(`/api/games/${encodeURIComponent(id)}/updates`),
  designer: (slug: string) => req<DesignerResponse>(`/api/designers/${encodeURIComponent(slug)}`),
  designers: () => req<DesignersResponse>('/api/designers'),
  watch: (id: string) => req<WatchResponse>(`/api/tables/${encodeURIComponent(id)}/watch`),

  myTables: () => req<MyTablesResponse>('/api/my-tables'),
  table: (id: string) => req<TableResponse>(`/api/tables/${encodeURIComponent(id)}`),
  tableEvents: (id: string, after: number) =>
    req<TableEventsResponse>(`/api/tables/${encodeURIComponent(id)}/events?after=${after}`),
  /** The table's past for its log: summaries and log lines, no views. */
  tableHistory: (id: string) =>
    req<TableEventsResponse>(`/api/tables/${encodeURIComponent(id)}/events?after=0&history=1`),
  deleteTable: (id: string) => req<{ ok: true }>(`/api/tables/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createTable,
  joinTable: (id: string) => post<{ seatPosition: number }>(`/api/tables/${encodeURIComponent(id)}/join`),
  setReady: (id: string, ready: boolean) => post<{ position: number; ready: boolean }>(`/api/tables/${encodeURIComponent(id)}/ready`, { ready }),
  startTable: (id: string) => after(post<{ tableId: string; status: string }>(`/api/tables/${encodeURIComponent(id)}/start`), () => track('game_started', { table_id: id })),

  friends: () => req<FriendsResponse>('/api/friends'),
  sendFriendRequest: (email: string) => after(post<{ ok: true; accepted: boolean; userId: string }>('/api/friends/requests', { email }), () => track('friend_request_sent')),
  acceptFriendRequest: (id: string) => post<{ ok: true }>(`/api/friends/requests/${encodeURIComponent(id)}/accept`),
  deleteFriendRequest: (id: string) => req<{ ok: true }>(`/api/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  unfriend: (userId: string) => req<{ ok: true }>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  admin: {
    content: () => req<AdminContentResponse>('/api/admin/content'),
    saveGame: (id: string, body: AdminGameEdit) =>
      req<{ ok: true }>(`/api/admin/games/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
    createDesigner: (body: AdminDesignerEdit) => post<{ ok: true; slug: string }>('/api/admin/designers', body),
    saveDesigner: (slug: string, body: AdminDesignerEdit) =>
      req<{ ok: true }>(`/api/admin/designers/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(body) }),
    createUpdate: (body: AdminUpdateEdit) => post<{ ok: true; id: string }>('/api/admin/updates', body),
    saveUpdate: (id: string, body: AdminUpdateEdit) =>
      req<{ ok: true }>(`/api/admin/updates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
    removeUpdate: (id: string) => req<{ ok: true }>(`/api/admin/updates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    uploadImage: (body: AdminMediaUpload) => post<AdminMediaResponse>('/api/admin/media', body),
  },

  invites: () => req<InvitesResponse>('/api/invites'),
  tableInvites: (id: string) => req<InvitesResponse>(`/api/tables/${encodeURIComponent(id)}/invites`),
  inviteToTable: (id: string, target: { email: string } | { userId: string }) =>
    after(post<{ ok: true; inviteId: string }>(`/api/tables/${encodeURIComponent(id)}/invites`, target),
      () => track('invite_sent', { table_id: id, to: 'email' in target ? 'email' : 'friend' })),
  acceptInvite: (id: string) => after(post<{ ok: true; tableId: string }>(`/api/invites/${encodeURIComponent(id)}/accept`), (r) => track('invite_accepted', { table_id: r.tableId })),
  declineInvite: (id: string) => post<{ ok: true }>(`/api/invites/${encodeURIComponent(id)}/decline`),
};

/**
 * Make sure this browser has a principal: a guest is created on first
 * visit, silently, so Play now works with no account. Never a wall.
 */
export async function ensurePrincipal(): Promise<MeResponse> {
  const me = await api.me();
  if (me.user || me.guest) return me;
  const created = await api.createGuest();
  return { user: null, guest: created.guest };
}
