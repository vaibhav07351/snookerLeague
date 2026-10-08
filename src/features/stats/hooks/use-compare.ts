import { useMemo } from 'react';

import type { LeagueStats } from '@/features/stats/hooks/use-league-stats';
import { playerCardOf, type PlayerCard } from '@/features/stats/hooks/use-player-card';
import { headToHead, type HeadToHead } from '@/features/stats/services/head-to-head.service';

export interface Comparison {
  a: PlayerCard;
  b: PlayerCard;
  h2h: HeadToHead;
}

/** Two player cards plus their record against each other; null until both exist. */
export function useCompare(
  stats: LeagueStats,
  aId: string | null,
  bId: string | null,
): Comparison | null {
  return useMemo(() => {
    const a = playerCardOf(stats, aId);
    const b = playerCardOf(stats, bId);
    if (!a || !b || !aId || !bId) {
      return null;
    }
    return { a, b, h2h: headToHead(aId, bId, stats.matches, stats.races) };
  }, [stats, aId, bId]);
}
