import type { GameCatalogEntry, GameTable, TableEventWire } from '@universe/shared';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  games: () => req<GameCatalogEntry[]>('/api/games'),
  game: (id: string) => req<GameCatalogEntry>(`/api/games/${id}`),
  myTables: () => req<GameTable[]>('/api/my-tables'),
  table: (id: string) => req<GameTable>(`/api/tables/${id}`),
  tableEvents: (id: string, after: number) => req<TableEventWire[]>(`/api/tables/${id}/events?after=${after}`),
  createTable: (body: unknown) => req<GameTable>('/api/tables', { method: 'POST', body: JSON.stringify(body) }),
  createGuest: () => req<{ id: string }>('/api/guests', { method: 'POST' }),
  signInEmail: (email: string) => req<{ ok: boolean }>('/api/auth/email-link', { method: 'POST', body: JSON.stringify({ email }) }),
};
