import type {
  FeedEvent,
  GroupMatch,
  GroupStats,
  Match,
  Player,
  Race,
  RaceStats,
  StandardStats,
} from '@/shared/types/domain';
import {
  emptyGroupStats,
  emptyRaceStats,
  emptyStandardStats,
  matchPlayedAt,
} from '@/shared/types/domain';
import { updateStore } from '@/shared/storage/local-store';
import { frameSecondsOf } from '@/shared/utils/frame-time';
import { playerShotTotals } from '@/features/match/services/frame-rank';
import { visitBreaks } from '@/features/match/services/frame-engine';
import { highestBreaksOf } from '@/features/group/services/group-frame-engine';

function pct(part: number, whole: number): number {
  if (whole <= 0) {
    return 0;
  }
  return Math.round((part / whole) * 1000) / 10;
}

function avgOrNull(sum: number, count: number): number | null {
  if (count <= 0) {
    return null;
  }
  return Math.round(sum / count);
}

export function recomputeStandardStats(playerId: string, matches: Match[]): StandardStats {
  const relevant = matches
    .filter((m) => m.outcome.status !== 'in_progress')
    .filter((m) => m.teamA.includes(playerId) || m.teamB.includes(playerId))
    .sort((a, b) => matchPlayedAt(a).localeCompare(matchPlayedAt(b)));

  let wins = 0;
  let streak = 0;
  let titles = 0;
  let forfeits = 0;
  let winsByForfeit = 0;
  let lastPlayedAt: string | null = null;

  let timedFrames = 0;
  let totalFrameSeconds = 0;
  let timedFramesWon = 0;
  let winFrameSeconds = 0;
  let timedFramesLost = 0;
  let lossFrameSeconds = 0;
  let fastestFrameSeconds: number | null = null;
  let slowestFrameSeconds: number | null = null;
  let highestBreak = 0;
  let breaks50 = 0;
  let centuries = 0;
  let maximums = 0;
  let pointsScored = 0;
  let fouls = 0;
  let foulPoints = 0;

  for (const match of relevant) {
    const side: 'a' | 'b' = match.teamA.includes(playerId) ? 'a' : 'b';
    const outcome = match.outcome;
    const won =
      outcome.status === 'completed' || outcome.status === 'forfeited'
        ? outcome.winner === side
        : false;

    if (outcome.status === 'forfeited') {
      if (outcome.forfeitedBy === side) {
        forfeits += 1;
      }
      if (won) {
        winsByForfeit += 1;
      }
    }

    if (won) {
      wins += 1;
      streak += 1;
    } else {
      streak = 0;
    }
    if (match.crownsChampion && won) {
      titles += 1;
    }
    lastPlayedAt = matchPlayedAt(match);

    for (const frame of match.frames) {
      const shots = frame.shots ?? [];
      const tagged = shots.some((s) => Boolean(s.playerId));
      if (tagged) {
        const totals = playerShotTotals(shots, { a: match.teamA, b: match.teamB });
        const mine = totals[playerId];
        if (mine) {
          pointsScored += mine.scored;
          fouls += mine.fouls;
          foulPoints += mine.foulPoints;
        }
      } else {
        pointsScored += side === 'a' ? frame.teamAPoints : frame.teamBPoints;
      }
      const visits = visitBreaks(shots).filter((v) =>
        v.playerId ? v.playerId === playerId : v.side === side,
      );
      for (const visit of visits) {
        if (visit.value > highestBreak) {
          highestBreak = visit.value;
        }
        if (visit.value >= 50) {
          breaks50 += 1;
        }
        if (visit.value >= 100) {
          centuries += 1;
        }
        if (visit.value === 147) {
          maximums += 1;
        }
      }
      const dur = frame.durationSeconds;
      if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0) {
        continue;
      }
      timedFrames += 1;
      totalFrameSeconds += dur;
      if (fastestFrameSeconds == null || dur < fastestFrameSeconds) {
        fastestFrameSeconds = dur;
      }
      if (slowestFrameSeconds == null || dur > slowestFrameSeconds) {
        slowestFrameSeconds = dur;
      }
      if (frame.winner === side) {
        timedFramesWon += 1;
        winFrameSeconds += dur;
      } else {
        timedFramesLost += 1;
        lossFrameSeconds += dur;
      }
    }
  }

  return {
    played: relevant.length,
    wins,
    winPct: pct(wins, relevant.length),
    lastPlayedAt,
    streak,
    titles,
    forfeits,
    winsByForfeit,
    timedFrames,
    totalFrameSeconds,
    avgFrameSeconds: avgOrNull(totalFrameSeconds, timedFrames),
    timedFramesWon,
    avgWinFrameSeconds: avgOrNull(winFrameSeconds, timedFramesWon),
    timedFramesLost,
    avgLossFrameSeconds: avgOrNull(lossFrameSeconds, timedFramesLost),
    fastestFrameSeconds,
    slowestFrameSeconds,
    highestBreak,
    breaks50,
    centuries,
    maximums,
    pointsScored,
    fouls,
    foulPoints,
    netPoints: pointsScored - foulPoints,
  };
}

export function recomputeRaceStats(playerId: string, races: Race[]): RaceStats {
  const relevant = races
    .filter((r) => r.status === 'completed')
    .filter((r) => r.entrants.some((e) => e.playerId === playerId))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  let firsts = 0;
  let seconds = 0;
  let thirds = 0;
  let placeSum = 0;
  let placeCount = 0;
  let firstStreak = 0;
  let titles = 0;
  let lastPlayedAt: string | null = null;

  for (const race of relevant) {
    const entrant = race.entrants.find((e) => e.playerId === playerId);
    if (!entrant || entrant.place === null || entrant.place === 'dnf') {
      firstStreak = 0;
      lastPlayedAt = race.updatedAt;
      continue;
    }
    const place = entrant.place;
    placeSum += place;
    placeCount += 1;
    if (place === 1) {
      firsts += 1;
      firstStreak += 1;
    } else {
      firstStreak = 0;
    }
    if (place === 2) {
      seconds += 1;
    }
    if (place === 3) {
      thirds += 1;
    }
    if (race.crownsRaceChampion && place === 1) {
      titles += 1;
    }
    lastPlayedAt = race.updatedAt;
  }

  const podiums = firsts + seconds + thirds;
  return {
    played: relevant.length,
    firsts,
    seconds,
    thirds,
    podiumPct: pct(podiums, relevant.length),
    avgPlace: placeCount > 0 ? Math.round((placeSum / placeCount) * 10) / 10 : null,
    firstPct: pct(firsts, relevant.length),
    lastPlayedAt,
    firstStreak,
    titles,
  };
}

export function recomputeGroupStats(playerId: string, groupMatches: GroupMatch[]): GroupStats {
  const relevant = groupMatches
    .filter((g) => g.status === 'completed' && g.playerIds.includes(playerId))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const stats = emptyGroupStats();
  let timedFrames = 0;
  let totalFrameSeconds = 0;
  let timedFramesWon = 0;
  let winFrameSeconds = 0;
  let timedFramesLost = 0;
  let lossFrameSeconds = 0;
  let fastestFrameSeconds: number | null = null;
  let slowestFrameSeconds: number | null = null;
  for (const match of relevant) {
    stats.played += 1;
    if (match.winnerId === playerId) {
      stats.wins += 1;
    }
    for (const frame of match.frames) {
      stats.framesPlayed += 1;
      if (frame.winnerId === playerId) {
        stats.framesWon += 1;
      }
      stats.pointsScored += frame.points[playerId] ?? 0;
      const best = highestBreaksOf(frame.shots ?? [])[playerId] ?? 0;
      stats.highestBreak = Math.max(stats.highestBreak, best);
      const dur = frameSecondsOf(frame);
      if (dur === null) {
        continue;
      }
      timedFrames += 1;
      totalFrameSeconds += dur;
      fastestFrameSeconds = fastestFrameSeconds === null ? dur : Math.min(fastestFrameSeconds, dur);
      slowestFrameSeconds = slowestFrameSeconds === null ? dur : Math.max(slowestFrameSeconds, dur);
      if (frame.winnerId === playerId) {
        timedFramesWon += 1;
        winFrameSeconds += dur;
      } else {
        timedFramesLost += 1;
        lossFrameSeconds += dur;
      }
    }
    stats.lastPlayedAt = match.finishedAt ?? match.updatedAt;
  }
  stats.winPct = pct(stats.wins, stats.played);
  return {
    ...stats,
    timedFrames,
    totalFrameSeconds,
    timedFramesWon,
    winFrameSeconds,
    timedFramesLost,
    lossFrameSeconds,
    fastestFrameSeconds,
    slowestFrameSeconds,
  };
}

/** Results a league's player stats are computed from. */
export interface LeagueResults {
  matches: Match[];
  races: Race[];
  groupMatches: GroupMatch[];
}

export function applyPlayerStats(
  players: Player[],
  leagueId: string,
  { matches, races, groupMatches }: LeagueResults,
): Player[] {
  return players.map((player) => {
    if (player.leagueId !== leagueId) {
      return player;
    }
    return {
      ...player,
      stats: {
        standard: recomputeStandardStats(
          player.id,
          matches.filter((m) => m.leagueId === leagueId),
        ),
        race: recomputeRaceStats(
          player.id,
          races.filter((r) => r.leagueId === leagueId),
        ),
        group: recomputeGroupStats(
          player.id,
          groupMatches.filter((g) => g.leagueId === leagueId),
        ),
      },
    };
  });
}

export function resetPlayerStats(player: Player): Player {
  return {
    ...player,
    stats: { standard: emptyStandardStats(), race: emptyRaceStats(), group: emptyGroupStats() },
  };
}

export function listFeed(events: FeedEvent[], leagueId: string, limit = 20): FeedEvent[] {
  return events
    .filter((e) => e.leagueId === leagueId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Recompute cached player aggregates locally. No-ops if nothing changed. */
export async function refreshLeaguePlayerStats(leagueId: string): Promise<void> {
  await updateStore((s) => {
    const nextPlayers = applyPlayerStats(s.players, leagueId, {
      matches: s.matches,
      races: s.races,
      groupMatches: s.groupMatches,
    });
    const prevById = new Map(s.players.map((p) => [p.id, p]));
    const changed = nextPlayers.some((p) => {
      if (p.leagueId !== leagueId) {
        return false;
      }
      const prev = prevById.get(p.id);
      return !prev || JSON.stringify(prev.stats) !== JSON.stringify(p.stats);
    });
    if (!changed && nextPlayers.length === s.players.length) {
      return s;
    }
    // Stats are derived from matches and races, so they do not count as an edit of the
    // player (no updatedAt bump that would make this copy beat a real rename elsewhere).
    return { ...s, players: nextPlayers };
  });
}
