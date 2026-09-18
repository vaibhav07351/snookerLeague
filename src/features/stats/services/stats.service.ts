import type {
  FeedEvent,
  Match,
  Player,
  Race,
  RaceStats,
  StandardStats,
} from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';
import { updateStore } from '@/shared/storage/local-store';

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
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

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
    lastPlayedAt = match.updatedAt;

    for (const frame of match.frames) {
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

export function applyPlayerStats(
  players: Player[],
  leagueId: string,
  matches: Match[],
  races: Race[],
): Player[] {
  return players.map((player) => {
    if (player.leagueId !== leagueId) {
      return player;
    }
    return {
      ...player,
      stats: {
        standard: recomputeStandardStats(player.id, matches.filter((m) => m.leagueId === leagueId)),
        race: recomputeRaceStats(player.id, races.filter((r) => r.leagueId === leagueId)),
      },
    };
  });
}

export function resetPlayerStats(player: Player): Player {
  return {
    ...player,
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

export function sortStandardLeaderboard(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (b.stats.standard.winPct !== a.stats.standard.winPct) {
      return b.stats.standard.winPct - a.stats.standard.winPct;
    }
    if (b.stats.standard.wins !== a.stats.standard.wins) {
      return b.stats.standard.wins - a.stats.standard.wins;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function sortRaceLeaderboard(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (b.stats.race.firstPct !== a.stats.race.firstPct) {
      return b.stats.race.firstPct - a.stats.race.firstPct;
    }
    if (b.stats.race.firsts !== a.stats.race.firsts) {
      return b.stats.race.firsts - a.stats.race.firsts;
    }
    const avgA = a.stats.race.avgPlace ?? 99;
    const avgB = b.stats.race.avgPlace ?? 99;
    if (avgA !== avgB) {
      return avgA - avgB;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function listFeed(events: FeedEvent[], leagueId: string, limit = 20): FeedEvent[] {
  return events
    .filter((e) => e.leagueId === leagueId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Recompute cached player aggregates (e.g. after schema adds forfeit fields). */
export async function refreshLeaguePlayerStats(leagueId: string): Promise<void> {
  await updateStore((s) => ({
    ...s,
    players: applyPlayerStats(s.players, leagueId, s.matches, s.races),
  }));
}
