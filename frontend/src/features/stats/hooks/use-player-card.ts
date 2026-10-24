import { useMemo } from 'react';

import type { LeagueStats } from '@/features/stats/hooks/use-league-stats';
import { findRivals, type Rivals } from '@/features/stats/services/head-to-head.service';
import {
  buildPlayerInsights,
  type PlayerInsights,
} from '@/features/stats/services/insights.service';
import { ratingOf, type RatingEntry } from '@/features/stats/services/rating.service';
import { leagueRecords, type LeagueRecord } from '@/features/stats/services/records.service';

export interface PlayerCard {
  insights: PlayerInsights;
  rating: RatingEntry;
  /** Rating rank; null while provisional. */
  rank: number | null;
  /** How many players are ranked in the league. */
  rankedCount: number;
  rivals: Rivals;
}

export function playerCardOf(stats: LeagueStats, playerId: string | null): PlayerCard | null {
  const player = playerId ? stats.playerById.get(playerId) : undefined;
  if (!player) {
    return null;
  }
  return {
    insights: buildPlayerInsights(player, stats.matches),
    rating: ratingOf(stats.ratings, player.id),
    rank: stats.ranks.get(player.id) ?? null,
    rankedCount: stats.ranks.size,
    rivals: findRivals(player.id, stats.matches),
  };
}

/** Everything one player's card shows, or null if the player is not in this league. */
export function usePlayerCard(stats: LeagueStats, playerId: string | null): PlayerCard | null {
  return useMemo(() => playerCardOf(stats, playerId), [stats, playerId]);
}

/** The league's hall of fame. */
export function useLeagueRecords(stats: LeagueStats): LeagueRecord[] {
  return useMemo(() => leagueRecords(stats.players, stats.ratings), [stats]);
}
