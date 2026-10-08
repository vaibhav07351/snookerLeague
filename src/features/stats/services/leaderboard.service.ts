import type { Match, Player, Race } from '@/shared/types/domain';
import {
  computeRatings,
  PROVISIONAL_GAMES,
  ratingOf,
  type FormResult,
  type RatingTable,
} from '@/features/stats/services/rating.service';
import {
  recomputeRaceStats,
  recomputeStandardStats,
} from '@/features/stats/services/stats.service';

export type BoardKey = 'rating' | 'wins' | 'race' | 'breaks';
export type BoardPeriod = 'all' | '30d';

export const PERIOD_DAYS = 30;
/** Rank movement compares against the board as it stood this many days ago. */
export const MOVEMENT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Results needed to be ranked on a board, per period. */
const MIN_GAMES: Record<Exclude<BoardKey, 'breaks'>, Record<BoardPeriod, number>> = {
  rating: { all: PROVISIONAL_GAMES, '30d': 2 },
  wins: { all: 3, '30d': 2 },
  race: { all: 3, '30d': 2 },
};

export interface BoardRow {
  playerId: string;
  name: string;
  /** 1-based rank; null while the player has not qualified. */
  rank: number | null;
  value: string;
  sub: string;
  /** Places gained (+) or lost (-) since `MOVEMENT_DAYS` ago; null when unknown. */
  movement: number | null;
  /** Ranked now but not on the board a week ago. */
  isNew: boolean;
  form: FormResult[];
  qualified: boolean;
  /** Results still needed to qualify (0 when qualified). */
  needs: number;
}

export interface Board {
  key: BoardKey;
  period: BoardPeriod;
  /** Qualified rows in rank order, then players still qualifying. */
  rows: BoardRow[];
  qualifiedCount: number;
}

export interface BoardInput {
  key: BoardKey;
  period: BoardPeriod;
  players: Player[];
  /** League matches and races (any status; unfinished ones are ignored). */
  matches: Match[];
  races: Race[];
  /** All-time ratings for these matches and races (computed once by the caller). */
  ratings: RatingTable;
  now: Date;
}

interface Scored {
  playerId: string;
  name: string;
  qualified: boolean;
  needs: number;
  games: number;
  /** Sort keys, highest first. */
  keys: number[];
  value: string;
  sub: string;
}

interface ScoreContext {
  key: BoardKey;
  period: BoardPeriod;
  players: Player[];
  matches: Match[];
  races: Race[];
  ratings: RatingTable;
  /** Ratings at the start of the period (only for the 30-day rating board). */
  ratingsAtStart: RatingTable | null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function scorePlayer(ctx: ScoreContext, player: Player): Scored {
  const base = { playerId: player.id, name: player.displayName };
  if (ctx.key === 'rating') {
    const now = ratingOf(ctx.ratings, player.id);
    const min = MIN_GAMES.rating[ctx.period];
    if (ctx.ratingsAtStart) {
      const start = ratingOf(ctx.ratingsAtStart, player.id);
      const games = now.games - start.games;
      const gained = now.rating - start.rating;
      return {
        ...base,
        games,
        qualified: games >= min,
        needs: Math.max(min - games, 0),
        keys: [gained, now.rating],
        value: signed(gained),
        sub: `${games} results · now ${now.rating}`,
      };
    }
    return {
      ...base,
      games: now.games,
      qualified: now.games >= min,
      needs: Math.max(min - now.games, 0),
      keys: [now.rating, now.games],
      value: String(now.rating),
      sub: `${now.games} results · peak ${now.peak}`,
    };
  }
  if (ctx.key === 'wins') {
    const s = recomputeStandardStats(player.id, ctx.matches);
    const min = MIN_GAMES.wins[ctx.period];
    return {
      ...base,
      games: s.played,
      qualified: s.played >= min,
      needs: Math.max(min - s.played, 0),
      keys: [s.winPct, s.wins],
      value: `${s.winPct}%`,
      sub: `${s.wins}W ${s.played - s.wins}L`,
    };
  }
  if (ctx.key === 'race') {
    const r = recomputeRaceStats(player.id, ctx.races);
    const min = MIN_GAMES.race[ctx.period];
    return {
      ...base,
      games: r.played,
      qualified: r.played >= min,
      needs: Math.max(min - r.played, 0),
      keys: [r.firstPct, r.firsts, -(r.avgPlace ?? 99)],
      value: `${r.firstPct}%`,
      sub: `${r.firsts} wins · avg ${r.avgPlace ?? '-'}`,
    };
  }
  const s = recomputeStandardStats(player.id, ctx.matches);
  return {
    ...base,
    games: s.played,
    qualified: s.highestBreak > 0,
    needs: 0,
    keys: [s.highestBreak, s.centuries, s.breaks50],
    value: String(s.highestBreak),
    sub: `${s.centuries} tons · ${s.breaks50} 50+`,
  };
}

function compareScored(a: Scored, b: Scored): number {
  for (let i = 0; i < Math.max(a.keys.length, b.keys.length); i += 1) {
    const diff = (b.keys[i] ?? 0) - (a.keys[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.name.localeCompare(b.name);
}

function rankScored(ctx: ScoreContext): { qualified: Scored[]; waiting: Scored[] } {
  const scored = ctx.players.map((p) => scorePlayer(ctx, p));
  const qualified = scored.filter((s) => s.qualified).sort(compareScored);
  const waiting = scored
    .filter((s) => !s.qualified)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
  return { qualified, waiting };
}

function within<T extends { updatedAt: string }>(
  list: T[],
  from: string | null,
  to: string | null,
): T[] {
  return list.filter(
    (x) => (from == null || x.updatedAt >= from) && (to == null || x.updatedAt < to),
  );
}

/** One leaderboard: who qualifies, in what order, and how ranks moved this week. */
export function buildBoard(input: BoardInput): Board {
  const { key, period, players, ratings, now } = input;
  const periodStart =
    period === '30d' ? new Date(now.getTime() - PERIOD_DAYS * DAY_MS).toISOString() : null;
  const matches = within(input.matches, periodStart, null);
  const races = within(input.races, periodStart, null);

  const ctx: ScoreContext = {
    key,
    period,
    players,
    matches,
    races,
    ratings,
    ratingsAtStart:
      key === 'rating' && periodStart
        ? computeRatings(input.matches, input.races, { before: periodStart })
        : null,
  };
  const { qualified, waiting } = rankScored(ctx);

  // Movement only means something on the all-time boards (a 30-day window slides anyway).
  let previousRanks: Map<string, number> | null = null;
  if (period === 'all') {
    const cutoff = new Date(now.getTime() - MOVEMENT_DAYS * DAY_MS).toISOString();
    const before = rankScored({
      ...ctx,
      matches: within(input.matches, null, cutoff),
      races: within(input.races, null, cutoff),
      ratings:
        key === 'rating' ? computeRatings(input.matches, input.races, { before: cutoff }) : ratings,
    });
    previousRanks = new Map(before.qualified.map((s, i) => [s.playerId, i + 1]));
  }

  const rows: BoardRow[] = [
    ...qualified.map((s, i) => {
      const rank = i + 1;
      const previous = previousRanks?.get(s.playerId) ?? null;
      return {
        playerId: s.playerId,
        name: s.name,
        rank,
        value: s.value,
        sub: s.sub,
        movement: previous != null ? previous - rank : null,
        isNew: previousRanks != null && previous == null,
        form: ratingOf(ratings, s.playerId).form,
        qualified: true,
        needs: 0,
      };
    }),
    ...waiting.map((s) => ({
      playerId: s.playerId,
      name: s.name,
      rank: null,
      value: key === 'breaks' ? '-' : s.value,
      sub:
        key === 'breaks'
          ? 'No break logged yet'
          : `${s.needs} more ${s.needs === 1 ? 'result' : 'results'} to qualify`,
      movement: null,
      isNew: false,
      form: ratingOf(ratings, s.playerId).form,
      qualified: false,
      needs: s.needs,
    })),
  ];
  return { key, period, rows, qualifiedCount: qualified.length };
}
