import { describe, expect, it, jest } from '@jest/globals';

// stats.service also persists to device storage; these tests only use its pure helpers.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { buildBoard } from '@/features/stats/services/leaderboard.service';
import { computeRatings } from '@/features/stats/services/rating.service';
import { dayIso, match, player, race } from '@/features/stats/services/stats-fixtures';
import type { Match, Race } from '@/shared/types/domain';

const players = [player('a', 'Aman'), player('b', 'Bina'), player('c', 'Chirag')];

function board(
  key: 'rating' | 'wins' | 'race' | 'breaks',
  matches: Match[],
  races: Race[] = [],
  opts: { period?: 'all' | '30d'; nowDay?: number } = {},
) {
  return buildBoard({
    key,
    period: opts.period ?? 'all',
    players,
    matches,
    races,
    ratings: computeRatings(matches, races),
    now: new Date(dayIso(opts.nowDay ?? 100)),
  });
}

describe('buildBoard', () => {
  it('does not let one lucky win top the wins board', () => {
    const matches = [
      ...[1, 2, 3, 4].map((day) => match(['a'], ['b'], { day })),
      match(['b'], ['a'], { day: 5 }),
      match(['c'], ['b'], { day: 6 }),
    ];
    const result = board('wins', matches);
    expect(result.rows[0]?.playerId).toBe('a');
    expect(result.rows[0]?.value).toBe('80%');
    const chirag = result.rows.find((r) => r.playerId === 'c');
    expect(chirag?.qualified).toBe(false);
    expect(chirag?.rank).toBeNull();
    expect(chirag?.sub).toBe('2 more results to qualify');
  });

  it('ranks the rating board by rating and lists provisional players last', () => {
    const matches = [1, 2, 3, 4, 5].map((day) => match(['a'], ['b'], { day }));
    const result = board('rating', matches);
    expect(result.qualifiedCount).toBe(2);
    expect(result.rows.map((r) => r.playerId)).toEqual(['a', 'b', 'c']);
    expect(result.rows[2]?.needs).toBe(5);
  });

  it('reports rank movement against a week ago', () => {
    const matches = [
      ...[1, 2, 3].map((day) => match(['b'], ['a'], { day })),
      ...[95, 96, 97, 98].map((day) => match(['a'], ['b'], { day })),
    ];
    const result = board('wins', matches);
    const aman = result.rows.find((r) => r.playerId === 'a');
    expect(aman?.rank).toBe(1);
    expect(aman?.movement).toBe(1);
  });

  it('only counts the last 30 days on the 30-day board', () => {
    const matches = [
      ...[1, 2, 3].map((day) => match(['b'], ['a'], { day })),
      ...[90, 91].map((day) => match(['a'], ['b'], { day })),
    ];
    const result = board('wins', matches, [], { period: '30d' });
    expect(result.rows[0]?.playerId).toBe('a');
    expect(result.rows[0]?.value).toBe('100%');
    expect(result.rows[0]?.movement).toBeNull();
  });

  it('shows rating gained within the period on the 30-day rating board', () => {
    const matches = [90, 91].map((day) => match(['a'], ['b'], { day }));
    const result = board('rating', matches, [], { period: '30d' });
    expect(result.rows[0]?.playerId).toBe('a');
    expect(result.rows[0]?.value.startsWith('+')).toBe(true);
  });

  it('ranks the race board by win rate with a minimum number of races', () => {
    const races = [
      race({ a: 1, b: 2 }, 1),
      race({ a: 2, b: 1 }, 2),
      race({ a: 1, b: 2 }, 3),
      race({ c: 1, a: 2 }, 4),
    ];
    const result = board('race', [], races);
    expect(result.rows[0]?.playerId).toBe('a');
    expect(result.rows.find((r) => r.playerId === 'c')?.qualified).toBe(false);
  });

  it('handles a league with no results', () => {
    const result = board('breaks', []);
    expect(result.qualifiedCount).toBe(0);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.sub).toBe('No break logged yet');
  });
});
