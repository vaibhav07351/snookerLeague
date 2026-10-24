import { useEffect, useMemo, useState } from 'react';

import {
  computeRatings,
  ratingRanks,
  type RatingTable,
} from '@/features/stats/services/rating.service';
import {
  applyPlayerStats,
  refreshLeaguePlayerStats,
} from '@/features/stats/services/stats.service';
import { useStoreTick } from '@/shared/hooks/use-store-reload';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Match, Player, Race } from '@/shared/types/domain';

export interface LeagueStats {
  /** False until the local store has loaded from disk. */
  ready: boolean;
  leagueId: string | null;
  /** League players with stats freshly derived from `matches` and `races`, A to Z. */
  players: Player[];
  playerById: Map<string, Player>;
  /** Finished league matches and races only (live ones never count toward stats). */
  matches: Match[];
  races: Race[];
  ratings: RatingTable;
  /** Rating rank of each qualified player (provisional players are absent). */
  ranks: Map<string, number>;
  /** The signed-in user's player card in this league, if they have one. */
  meId: string | null;
}

const EMPTY: LeagueStats = {
  ready: false,
  leagueId: null,
  players: [],
  playerById: new Map(),
  matches: [],
  races: [],
  ratings: new Map(),
  ranks: new Map(),
  meId: null,
};

/**
 * One league's results, players and ratings, rebuilt only when the underlying data
 * changes. Every stats screen reads through this, so the rating replay runs once per
 * change rather than once per render.
 */
export function useLeagueStats(
  leagueId: string | null | undefined,
  authUid: string | null | undefined,
): LeagueStats {
  // Re-render on store writes; the memo below decides whether anything is recomputed.
  useStoreTick();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!leagueId) {
      return;
    }
    let cancelled = false;
    loadStore()
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
        }
        // Keeps the cached player stats (used by lists elsewhere) in step.
        return refreshLeaguePlayerStats(leagueId);
      })
      .catch((error: unknown) => {
        logger.error('use-league-stats', 'Loading league stats failed', {
          leagueId,
          shape: error instanceof Error ? error.name : 'unknown',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  // Live matches and races change on every shot but never count toward stats, so the
  // expensive rebuild below is keyed only on finished results and the player list.
  const signature = leagueId ? dataSignature(leagueId) : '';

  return useMemo(() => {
    if (!leagueId || !loaded) {
      return EMPTY;
    }
    const store = getStore();
    const matches = store.matches.filter(
      (m) => m.leagueId === leagueId && m.outcome.status !== 'in_progress',
    );
    const races = store.races.filter((r) => r.leagueId === leagueId && r.status === 'completed');
    const players = applyPlayerStats(
      store.players.filter((p) => p.leagueId === leagueId),
      leagueId,
      matches,
      races,
    ).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const ratings = computeRatings(matches, races);
    return {
      ready: true,
      leagueId,
      players,
      playerById: new Map(players.map((p) => [p.id, p])),
      matches,
      races,
      ratings,
      ranks: ratingRanks(
        ratings,
        players.map((p) => p.id),
      ),
      meId: authUid ? (players.find((p) => p.authUid === authUid)?.id ?? null) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for the store data read inside.
  }, [leagueId, authUid, loaded, signature]);
}

/** Cheap fingerprint of what stats depend on: finished results and player identities. */
function dataSignature(leagueId: string): string {
  const store = getStore();
  const parts: string[] = [];
  for (const p of store.players) {
    if (p.leagueId === leagueId) {
      parts.push(`p:${p.id}:${p.displayName}:${p.authUid ?? ''}:${p.kind}`);
    }
  }
  for (const m of store.matches) {
    if (m.leagueId === leagueId && m.outcome.status !== 'in_progress') {
      parts.push(`m:${m.id}:${m.updatedAt}:${m.outcome.status}`);
    }
  }
  for (const r of store.races) {
    if (r.leagueId === leagueId && r.status === 'completed') {
      parts.push(`r:${r.id}:${r.updatedAt}`);
    }
  }
  return parts.join('|');
}
