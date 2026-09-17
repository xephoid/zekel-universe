// The REST client. Every call is typed by the shared wire contract, so a
// response shape the server changes fails to compile here.

import type {
  ApiError, CreateTableRequest, CreateTableResponse, FriendsResponse, GameReferenceResponse, GameResponse, GamesResponse,
  InvitesResponse, MeResponse, MyTablesResponse, TableEventsResponse, TableResponse, UpdatesResponse, DesignerResponse, WatchResponse } from '@universe/shared';

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

export const api = {
  me: () => req<MeResponse>('/api/me'),
  createGuest: () => post<{ guest: MeResponse['guest'] }>('/api/guests'),
  updateMe: (displayName: string, bio?: string) => req<{ ok: true }>('/api/me', { method: 'PATCH', body: JSON.stringify({ displayName, bio }) }),
  signInEmail: (email: string) => post<{ ok: true }>('/api/auth/email/link', { email }),
  completeSignIn: (token: string) => post<{ ok: true; userId: string }>('/api/auth/email/complete', { token }),
  signOut: () => post<{ ok: true }>('/api/auth/signout'),

  games: () => req<GamesResponse>('/api/games'),
  game: (id: string) => req<GameResponse>(`/api/games/${encodeURIComponent(id)}`),
  reference: (id: string) => req<GameReferenceResponse>(`/api/games/${encodeURIComponent(id)}/reference`),
  updates: (limit = 20) => req<UpdatesResponse>(`/api/updates?limit=${limit}`),
  gameUpdates: (id: string) => req<UpdatesResponse>(`/api/games/${encodeURIComponent(id)}/updates`),
  designer: (slug: string) => req<DesignerResponse>(`/api/designers/${encodeURIComponent(slug)}`),
  watch: (id: string) => req<WatchResponse>(`/api/tables/${encodeURIComponent(id)}/watch`),

  myTables: () => req<MyTablesResponse>('/api/my-tables'),
  table: (id: string) => req<TableResponse>(`/api/tables/${encodeURIComponent(id)}`),
  tableEvents: (id: string, after: number) =>
    req<TableEventsResponse>(`/api/tables/${encodeURIComponent(id)}/events?after=${after}`),
  createTable: (body: CreateTableRequest) => post<CreateTableResponse>('/api/tables', body),
  joinTable: (id: string) => post<{ seatPosition: number }>(`/api/tables/${encodeURIComponent(id)}/join`),
  setReady: (id: string, ready: boolean) => post<{ position: number; ready: boolean }>(`/api/tables/${encodeURIComponent(id)}/ready`, { ready }),
  startTable: (id: string) => post<{ tableId: string; status: string }>(`/api/tables/${encodeURIComponent(id)}/start`),

  friends: () => req<FriendsResponse>('/api/friends'),
  sendFriendRequest: (email: string) => post<{ ok: true; accepted: boolean; userId: string }>('/api/friends/requests', { email }),
  acceptFriendRequest: (id: string) => post<{ ok: true }>(`/api/friends/requests/${encodeURIComponent(id)}/accept`),
  deleteFriendRequest: (id: string) => req<{ ok: true }>(`/api/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  unfriend: (userId: string) => req<{ ok: true }>(`/api/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  invites: () => req<InvitesResponse>('/api/invites'),
  tableInvites: (id: string) => req<InvitesResponse>(`/api/tables/${encodeURIComponent(id)}/invites`),
  inviteToTable: (id: string, target: { email: string } | { userId: string }) =>
    post<{ ok: true; inviteId: string }>(`/api/tables/${encodeURIComponent(id)}/invites`, target),
  acceptInvite: (id: string) => post<{ ok: true; tableId: string }>(`/api/invites/${encodeURIComponent(id)}/accept`),
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
