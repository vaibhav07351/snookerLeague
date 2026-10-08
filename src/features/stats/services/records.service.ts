import type { Player } from '@/shared/types/domain';
import { ratingOf, type RatingTable } from '@/features/stats/services/rating.service';
import { formatDurationCompact } from '@/shared/utils/datetime';

export type RecordKey =
  'highestBreak' | 'centuries' | 'bestStreak' | 'peakRating' | 'titles' | 'fastestFrame';

export interface LeagueRecord {
  key: RecordKey;
  label: string;
  /** Display value, or '-' while nobody holds the record. */
  value: string;
  holderId: string | null;
  holderName: string | null;
}

interface Candidate {
  player: Player;
  score: number;
}

/** Highest score wins; ties go to the name that sorts first so the holder is stable. */
function best(candidates: Candidate[], lowerIsBetter = false): Candidate | null {
  const sorted = [...candidates].sort((a, b) => {
    const diff = lowerIsBetter ? a.score - b.score : b.score - a.score;
    return diff !== 0 ? diff : a.player.displayName.localeCompare(b.player.displayName);
  });
  return sorted[0] ?? null;
}

function record(
  key: RecordKey,
  label: string,
  winner: Candidate | null,
  format: (score: number) => string,
): LeagueRecord {
  return {
    key,
    label,
    value: winner ? format(winner.score) : '-',
    holderId: winner?.player.id ?? null,
    holderName: winner?.player.displayName ?? null,
  };
}

/**
 * The league's hall of fame. `players` must carry fresh stats for this league; ratings
 * come from the same replay the leaderboard uses.
 */
export function leagueRecords(players: Player[], ratings: RatingTable): LeagueRecord[] {
  const each = (score: (p: Player) => number): Candidate[] =>
    players.map((player) => ({ player, score: score(player) })).filter((c) => c.score > 0);

  const fastest = players
    .map((player) => ({ player, score: player.stats.standard.fastestFrameSeconds ?? 0 }))
    .filter((c) => c.score > 0);

  return [
    record(
      'highestBreak',
      'Highest break',
      best(each((p) => p.stats.standard.highestBreak)),
      String,
    ),
    record('centuries', 'Most centuries', best(each((p) => p.stats.standard.centuries)), String),
    record(
      'bestStreak',
      'Longest win streak',
      best(each((p) => ratingOf(ratings, p.id).bestStreak)),
      (n) => `${n} wins`,
    ),
    record(
      'peakRating',
      'Peak rating',
      best(
        each((p) => {
          const entry = ratingOf(ratings, p.id);
          return entry.games > 0 ? entry.peak : 0;
        }),
      ),
      String,
    ),
    record(
      'titles',
      'Most titles',
      best(each((p) => p.stats.standard.titles + p.stats.race.titles)),
      String,
    ),
    record('fastestFrame', 'Fastest frame', best(fastest, true), (n) => formatDurationCompact(n)),
  ];
}
