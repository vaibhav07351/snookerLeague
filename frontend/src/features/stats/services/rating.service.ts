import type { Match, Race } from '@/shared/types/domain';

/**
 * League rating (Elo). Ratings are never stored: they are rebuilt by replaying every
 * finished match and race in time order, so the result is the same on every phone and
 * a replay is always safe to repeat.
 */
export const BASE_RATING = 1000;
/** Results needed before a player is ranked; until then they are provisional. */
export const PROVISIONAL_GAMES = 5;
const K_MATCH = 32;
/** Shared across one race's pairings so a big race does not swing ratings harder. */
const K_RACE = 24;
const HISTORY_LENGTH = 20;
const FORM_LENGTH = 10;

/** 1 = win, 0 = loss, -1 = forfeit loss (the harsher kind). */
export type FormResult = 1 | 0 | -1;

export interface RatingEntry {
  playerId: string;
  rating: number;
  peak: number;
  /** Rated results: matches plus races. */
  games: number;
  provisional: boolean;
  /** Rating after each recent result, oldest first. */
  history: number[];
  /** Recent results across matches and races (race win = 1st place), oldest first. */
  form: FormResult[];
  /** Consecutive match wins right now. */
  currentStreak: number;
  /** Longest run of match wins ever. */
  bestStreak: number;
}

export type RatingTable = Map<string, RatingEntry>;

type RatedEvent =
  { at: string; kind: 'match'; match: Match } | { at: string; kind: 'race'; race: Race };

function expected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

function entryFor(table: RatingTable, playerId: string): RatingEntry {
  let entry = table.get(playerId);
  if (!entry) {
    entry = {
      playerId,
      rating: BASE_RATING,
      peak: BASE_RATING,
      games: 0,
      provisional: true,
      history: [],
      form: [],
      currentStreak: 0,
      bestStreak: 0,
    };
    table.set(playerId, entry);
  }
  return entry;
}

function pushCapped<T>(list: T[], value: T, cap: number): void {
  list.push(value);
  if (list.length > cap) {
    list.shift();
  }
}

function applyDelta(entry: RatingEntry, delta: number, result: FormResult): void {
  entry.rating += delta;
  entry.peak = Math.max(entry.peak, entry.rating);
  entry.games += 1;
  entry.provisional = entry.games < PROVISIONAL_GAMES;
  pushCapped(entry.history, Math.round(entry.rating), HISTORY_LENGTH);
  pushCapped(entry.form, result, FORM_LENGTH);
}

function teamRating(table: RatingTable, ids: string[]): number {
  if (ids.length === 0) {
    return BASE_RATING;
  }
  return ids.reduce((sum, id) => sum + entryFor(table, id).rating, 0) / ids.length;
}

function rateMatch(table: RatingTable, match: Match): void {
  const outcome = match.outcome;
  if (outcome.status === 'in_progress' || match.teamA.length === 0 || match.teamB.length === 0) {
    return;
  }
  const ratingA = teamRating(table, match.teamA);
  const ratingB = teamRating(table, match.teamB);
  const aWon = outcome.winner === 'a';
  const forfeit = outcome.status === 'forfeited';
  // A walkover is a full loss for the side that walked, but only half a win for the
  // other side: they did not win it at the table.
  const winnerFactor = forfeit ? 0.5 : 1;
  const deltaA =
    K_MATCH * ((aWon ? 1 : 0) - expected(ratingA, ratingB)) * (aWon ? winnerFactor : 1);
  const deltaB =
    K_MATCH * ((aWon ? 0 : 1) - expected(ratingB, ratingA)) * (aWon ? 1 : winnerFactor);

  const sides: Array<{ ids: string[]; delta: number; won: boolean; side: 'a' | 'b' }> = [
    { ids: match.teamA, delta: deltaA, won: aWon, side: 'a' },
    { ids: match.teamB, delta: deltaB, won: !aWon, side: 'b' },
  ];
  for (const { ids, delta, won, side } of sides) {
    const walked = forfeit && outcome.forfeitedBy === side;
    for (const id of ids) {
      const entry = entryFor(table, id);
      applyDelta(entry, delta, won ? 1 : walked ? -1 : 0);
      entry.currentStreak = won ? entry.currentStreak + 1 : 0;
      entry.bestStreak = Math.max(entry.bestStreak, entry.currentStreak);
    }
  }
}

/** Finishing order key: lower is better. DNF and unplaced entrants share last place. */
function placeKey(place: Race['entrants'][number]['place']): number {
  return typeof place === 'number' ? place : Number.POSITIVE_INFINITY;
}

function rateRace(table: RatingTable, race: Race): void {
  if (race.status !== 'completed' || race.entrants.length < 2) {
    return;
  }
  const entrants = race.entrants;
  const pairK = K_RACE / (entrants.length - 1);
  const before = entrants.map((e) => entryFor(table, e.playerId).rating);
  const deltas = entrants.map(() => 0);

  // Each pair of entrants counts as a head-to-head: finishing ahead beats the other.
  for (let i = 0; i < entrants.length; i += 1) {
    for (let j = i + 1; j < entrants.length; j += 1) {
      const pi = placeKey(entrants[i]!.place);
      const pj = placeKey(entrants[j]!.place);
      const score = pi === pj ? 0.5 : pi < pj ? 1 : 0;
      const delta = pairK * (score - expected(before[i]!, before[j]!));
      deltas[i]! += delta;
      deltas[j]! -= delta;
    }
  }
  entrants.forEach((e, i) => {
    applyDelta(entryFor(table, e.playerId), deltas[i]!, e.place === 1 ? 1 : 0);
  });
}

/**
 * Replay results in time order. `before` (ISO) limits the replay to results finished
 * earlier, which is how "rank a week ago" and "rating at the start of a period" work.
 */
export function computeRatings(
  matches: Match[],
  races: Race[],
  opts: { before?: string } = {},
): RatingTable {
  const events: RatedEvent[] = [];
  for (const match of matches) {
    if (match.outcome.status !== 'in_progress') {
      events.push({ at: match.updatedAt, kind: 'match', match });
    }
  }
  for (const race of races) {
    if (race.status === 'completed') {
      events.push({ at: race.updatedAt, kind: 'race', race });
    }
  }
  const cutoff = opts.before;
  const ordered = events
    .filter((e) => cutoff == null || e.at < cutoff)
    .sort((a, b) => a.at.localeCompare(b.at));

  const table: RatingTable = new Map();
  for (const event of ordered) {
    if (event.kind === 'match') {
      rateMatch(table, event.match);
    } else {
      rateRace(table, event.race);
    }
  }
  for (const entry of table.values()) {
    entry.rating = Math.round(entry.rating);
    entry.peak = Math.round(entry.peak);
  }
  return table;
}

/** A player's rating, or the starting rating if they have no rated results yet. */
export function ratingOf(table: RatingTable, playerId: string): RatingEntry {
  return (
    table.get(playerId) ?? {
      playerId,
      rating: BASE_RATING,
      peak: BASE_RATING,
      games: 0,
      provisional: true,
      history: [],
      form: [],
      currentStreak: 0,
      bestStreak: 0,
    }
  );
}

/** Ranks (1-based) of qualified players by rating; provisional players are not ranked. */
export function ratingRanks(table: RatingTable, playerIds: string[]): Map<string, number> {
  const ranked = playerIds
    .map((id) => ratingOf(table, id))
    .filter((e) => !e.provisional)
    .sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId));
  return new Map(ranked.map((e, i) => [e.playerId, i + 1]));
}
