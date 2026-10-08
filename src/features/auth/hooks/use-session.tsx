import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import * as authService from '@/features/auth/services/auth.service';
import * as leagueService from '@/features/league/services/league.service';
import { refreshLeaguePlayerStats } from '@/features/stats/services/stats.service';
import { loadStore, subscribeStore, getStore } from '@/shared/storage/local-store';
import { waitForFirebaseAuth } from '@/shared/firebase/app';
import { logger } from '@/shared/logging/logger';
import { startSyncRuntime } from '@/shared/sync';
import type { League, SessionUser } from '@/shared/types/domain';
import { leagueKindOf } from '@/shared/types/domain';

interface SessionState {
  ready: boolean;
  user: SessionUser | null;
  league: League | null;
  /** All leagues this user belongs to (any device-local membership). */
  leagues: League[];
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
  /** Switch active league and refresh that league's environment. */
  switchLeague: (leagueId: string) => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

function leaguesForUser(uid: string | undefined): League[] {
  if (!uid) {
    return [];
  }
  return getStore()
    .leagues.filter((l) => l.memberUids.includes(uid) && leagueKindOf(l) !== 'city')
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      await loadStore();
      const current = await authService.getCurrentUser();
      if (current && !current.isDemo) {
        // Let Firebase Auth restore its session first, so cloud reads made right after
        // start-up (an invite link, the first pull) are signed in.
        await waitForFirebaseAuth();
      }
      setUser(current);
      const active = await leagueService.getActiveLeague();
      if (active) {
        await refreshLeaguePlayerStats(active.id);
      }
      setLeague(active);
      setLeagues(leaguesForUser(current?.uid));
    } catch (error) {
      logger.error('use-session', 'Session refresh failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    } finally {
      // Never leave the app on the start-up spinner.
      setReady(true);
    }
  }, []);

  const switchLeague = useCallback(async (leagueId: string): Promise<void> => {
    await loadStore();
    const current = await authService.getCurrentUser();
    if (!current) {
      return;
    }
    if (getStore().activeLeagueId === leagueId) {
      return;
    }
    const next = await leagueService.setActiveLeague(leagueId, current.uid);
    await refreshLeaguePlayerStats(next.id);
    setLeague(next);
    setLeagues(leaguesForUser(current.uid));
  }, []);

  useEffect(() => {
    void refresh();
    const stopSync = startSyncRuntime();
    const unsubStore = subscribeStore(() => {
      setTick((t) => t + 1);
    });
    return () => {
      stopSync();
      unsubStore();
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const store = getStore();
    const nextUser = store.user;
    // Same rule as getActiveLeague: a city hub is never shown as "your league".
    const active = leagueService.resolveActiveLeague(store);
    const nextLeagues = leaguesForUser(nextUser?.uid);
    setUser((prev) => (prev === nextUser ? prev : nextUser));
    setLeague((prev) => (prev === active ? prev : active));
    setLeagues((prev) =>
      prev.length === nextLeagues.length && prev.every((l, i) => l === nextLeagues[i])
        ? prev
        : nextLeagues,
    );
  }, [tick, ready]);

  const value = useMemo(
    () => ({
      ready,
      user,
      league,
      leagues,
      refresh,
      setUser,
      switchLeague,
    }),
    [ready, user, league, leagues, refresh, switchLeague],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return ctx;
}
