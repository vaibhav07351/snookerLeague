import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import * as challengeService from '@/features/community/services/challenge.service';
import * as profileService from '@/features/community/services/profile.service';
import * as cityHubService from '@/features/league/services/city-hub.service';
import * as matchService from '@/features/match/services/match.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload, type StoreLoad } from '@/shared/hooks/use-store-reload';
import { logger } from '@/shared/logging/logger';
import type { Challenge, Match, PlayerProfile } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';

type Cursor = { rankScore: number; uid: string } | null;

export interface CityCommunityState {
  profiles: PlayerProfile[];
  best: PlayerProfile | null;
  challenges: Challenge[];
  live: Match[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  /** The city's players (from the server): loading, ready, or error with Retry. */
  load: StoreLoad;
  accept: (challengeId: string) => Promise<void>;
  setStatus: (challengeId: string, status: 'declined' | 'cancelled') => Promise<void>;
}

/** Players, live hub matches and my challenges for my city. */
export function useCityCommunity(uid: string | null, cityId: string | null): CityCommunityState {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [best, setBest] = useState<PlayerProfile | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [live, setLive] = useState<Match[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatusState] = useState<StoreLoad['status']>('loading');
  const [attempt, setAttempt] = useState(0);

  // Local data (challenges, live hub matches): re-read whenever the store changes.
  const reloadLocal = useCallback(async () => {
    if (!uid) {
      return;
    }
    const inbox = await challengeService.listMyChallenges({ refresh: false });
    setChallenges(inbox.filter((c) => c.status === 'pending'));
    const hub = cityId ? await cityHubService.getCityHubForUser(uid) : null;
    if (hub) {
      const matches = await matchService.listMatches(hub.id, { limit: 20 });
      setLive(matches.filter((m) => m.outcome.status === 'in_progress'));
    } else {
      setLive([]);
    }
  }, [cityId, uid]);
  useStoreReload(reloadLocal, cityId ? `community:${cityId}:${uid ?? ''}` : uid);

  // Cloud data (city players page 1, challenge inbox): fetched when the screen opens, the
  // city changes or Retry is tapped; not on every store change, so "Load more" pages stay.
  useEffect(() => {
    if (!uid || !cityId) {
      setProfiles([]);
      setBest(null);
      setStatusState('ready');
      return undefined;
    }
    let cancelled = false;
    setStatusState('loading');
    void (async () => {
      try {
        const [inbox, page] = await Promise.all([
          challengeService.listMyChallenges(),
          profileService.listCityProfiles({ cityId }),
        ]);
        if (cancelled) {
          return;
        }
        setChallenges(inbox.filter((c) => c.status === 'pending'));
        setProfiles(page.items);
        setCursor(page.nextCursor);
        setBest(profileService.bestInCity(page.items));
        setStatusState('ready');
      } catch (error) {
        logger.error('use-city-community', 'City players load failed', {
          shape: error instanceof Error ? error.name : 'unknown',
        });
        if (!cancelled) {
          setStatusState('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId, uid, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!cityId || !cursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await profileService.listCityProfiles({
        cityId,
        cursorRank: cursor.rankScore,
        cursorUid: cursor.uid,
      });
      setProfiles((prev) => {
        const seen = new Set(prev.map((p) => p.uid));
        return [...prev, ...page.items.filter((p) => !seen.has(p.uid))];
      });
      setCursor(page.nextCursor);
    } catch (error) {
      notify.error('Could not load more players', toUserMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }, [cityId, cursor, loadingMore]);

  const setStatus = useCallback(
    async (id: string, next: 'declined' | 'cancelled'): Promise<void> => {
      try {
        await challengeService.setChallengeStatus(id, next);
      } catch (error) {
        notify.error('Could not update the challenge', toUserMessage(error));
      }
    },
    [],
  );

  const accept = useCallback(async (id: string): Promise<void> => {
    try {
      const { match } = await challengeService.acceptChallenge(id);
      router.push(`/match/${match.id}`);
    } catch (error) {
      notify.error('Could not accept', toUserMessage(error));
    }
  }, []);

  return {
    profiles,
    best,
    challenges,
    live,
    hasMore: cursor != null,
    loadingMore,
    loadMore,
    load: { status, retry },
    accept,
    setStatus,
  };
}
