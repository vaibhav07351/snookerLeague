import { describe, expect, it } from '@jest/globals';

import {
  BASE_RATING,
  computeRatings,
  PROVISIONAL_GAMES,
  ratingOf,
  ratingRanks,
} from '@/features/stats/services/rating.service';
import { dayIso, match, race } from '@/features/stats/services/stats-fixtures';

describe('computeRatings', () => {
  it('starts everyone at the base rating and moves points from loser to winner', () => {
    const table = computeRatings([match(['a'], ['b'])], []);
    const a = ratingOf(table, 'a');
    const b = ratingOf(table, 'b');
    expect(a.rating).toBe(BASE_RATING + 16);
    expect(b.rating).toBe(BASE_RATING - 16);
    expect(a.form).toEqual([1]);
    expect(b.form).toEqual([0]);
    expect(ratingOf(table, 'nobody').rating).toBe(BASE_RATING);
  });

  it('rewards an upset more than a favourite winning', () => {
    const history = [1, 2, 3, 4].map((day) => match(['strong'], ['weak'], { day }));
    const favourite = computeRatings([...history, match(['strong'], ['x'], { day: 5 })], []);
    const upset = computeRatings([...history, match(['weak'], ['strong'], { day: 5 })], []);
    const favouriteGain =
      ratingOf(favourite, 'strong').rating - ratingOf(computeRatings(history, []), 'strong').rating;
    const upsetGain =
      ratingOf(upset, 'weak').rating - ratingOf(computeRatings(history, []), 'weak').rating;
    expect(upsetGain).toBeGreaterThan(favouriteGain);
  });

  it('gives both doubles partners the same change', () => {
    const table = computeRatings([match(['a', 'b'], ['c', 'd'])], []);
    expect(ratingOf(table, 'a').rating).toBe(ratingOf(table, 'b').rating);
    expect(ratingOf(table, 'c').rating).toBe(ratingOf(table, 'd').rating);
  });

  it('gives a forfeit winner half a win and the side that walked a full loss', () => {
    const table = computeRatings([match(['a'], ['b'], { winner: 'a', forfeitedBy: 'b' })], []);
    expect(ratingOf(table, 'a').rating).toBe(BASE_RATING + 8);
    expect(ratingOf(table, 'b').rating).toBe(BASE_RATING - 16);
    expect(ratingOf(table, 'b').form).toEqual([-1]);
  });

  it('rates a race as pairwise results, with DNF behind every finisher', () => {
    const table = computeRatings([], [race({ a: 1, b: 2, c: 'dnf' })]);
    const a = ratingOf(table, 'a').rating;
    const b = ratingOf(table, 'b').rating;
    const c = ratingOf(table, 'c').rating;
    expect(a).toBeGreaterThan(b);
    expect(b).toBe(BASE_RATING);
    expect(c).toBeLessThan(b);
    expect(ratingOf(table, 'a').form).toEqual([1]);
  });

  it('marks players provisional until they have enough results', () => {
    const games = Array.from({ length: PROVISIONAL_GAMES }, (_, i) =>
      match(['a'], ['b'], { day: i + 1 }),
    );
    expect(ratingOf(computeRatings(games.slice(0, -1), []), 'a').provisional).toBe(true);
    expect(ratingOf(computeRatings(games, []), 'a').provisional).toBe(false);
  });

  it('tracks current and best match win streaks', () => {
    const table = computeRatings(
      [
        match(['a'], ['b'], { day: 1 }),
        match(['a'], ['b'], { day: 2 }),
        match(['a'], ['b'], { day: 3, winner: 'b' }),
        match(['a'], ['b'], { day: 4 }),
      ],
      [],
    );
    expect(ratingOf(table, 'a').bestStreak).toBe(2);
    expect(ratingOf(table, 'a').currentStreak).toBe(1);
  });

  it('replays in time order and honours the before cutoff', () => {
    const early = match(['a'], ['b'], { day: 1 });
    const late = match(['b'], ['a'], { day: 10 });
    const full = computeRatings([late, early], []);
    const cut = computeRatings([late, early], [], { before: dayIso(5) });
    expect(ratingOf(cut, 'a').games).toBe(1);
    expect(ratingOf(full, 'a').games).toBe(2);
    expect(ratingOf(full, 'a').history).toHaveLength(2);
  });

  it('ignores unfinished matches', () => {
    const live = {
      ...match(['a'], ['b']),
      outcome: { status: 'in_progress', framesA: 1, framesB: 0 } as const,
    };
    expect(computeRatings([live], []).size).toBe(0);
  });
});

describe('ratingRanks', () => {
  it('ranks only qualified players, best rating first', () => {
    const games = Array.from({ length: PROVISIONAL_GAMES }, (_, i) =>
      match(['a'], ['b'], { day: i + 1 }),
    );
    const table = computeRatings([...games, match(['c'], ['a'], { day: 20 })], []);
    const ranks = ratingRanks(table, ['a', 'b', 'c']);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(2);
    expect(ranks.has('c')).toBe(false);
  });
});
