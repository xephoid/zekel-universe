// Who is at the keyboard: a guest (created silently on first visit) or a
// signed-in user. Pages read it to decide between Play now and sign-in.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MeResponse } from '@universe/shared';
import { api, ensurePrincipal } from './api';

interface SessionValue {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  displayName: string;
  signedIn: boolean;
}

const SessionContext = createContext<SessionValue>({
  me: null, loading: true, error: null, refresh: async () => {}, signOut: async () => {}, displayName: '', signedIn: false,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await ensurePrincipal());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<SessionValue>(() => ({
    me, loading, error, refresh,
    signOut: async () => { await api.signOut(); await refresh(); },
    displayName: me?.user?.displayName ?? me?.guest?.displayName ?? '',
    signedIn: !!me?.user,
  }), [me, loading, error, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
