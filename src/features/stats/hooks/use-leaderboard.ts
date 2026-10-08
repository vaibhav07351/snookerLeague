import { useMemo } from 'react';

import type { LeagueStats } from '@/features/stats/hooks/use-league-stats';
import {
  buildBoard,
  type Board,
  type BoardKey,
  type BoardPeriod,
} from '@/features/stats/services/leaderboard.service';

/** The board for one category and period; recomputed only when the data or choice changes. */
export function useLeaderboard(stats: LeagueStats, key: BoardKey, period: BoardPeriod): Board {
  return useMemo(
    () =>
      buildBoard({
        key,
        period,
        players: stats.players,
        matches: stats.matches,
        races: stats.races,
        ratings: stats.ratings,
        now: new Date(),
      }),
    [stats, key, period],
  );
}
