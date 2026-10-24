import { useMemo } from 'react';

import type { LeagueStats } from '@/features/stats/hooks/use-league-stats';
import {
  buildBoard,
  nextTarget,
  type Board,
  type BoardKey,
  type BoardPeriod,
  type NextTarget,
} from '@/features/stats/services/leaderboard.service';

export interface LeaderboardView {
  board: Board;
  /** What the signed-in player should aim for on this board, if anything. */
  target: NextTarget | null;
}

/** The board for one category and period; recomputed only when the data or choice changes. */
export function useLeaderboard(
  stats: LeagueStats,
  key: BoardKey,
  period: BoardPeriod,
): LeaderboardView {
  return useMemo(() => {
    const board = buildBoard({
      key,
      period,
      players: stats.players,
      matches: stats.matches,
      races: stats.races,
      ratings: stats.ratings,
      now: new Date(),
    });
    return { board, target: nextTarget(board, stats.meId) };
  }, [stats, key, period]);
}
