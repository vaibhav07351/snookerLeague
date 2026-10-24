import { describe, expect, it } from '@jest/globals';

import { findRivals, headToHead } from '@/features/stats/services/head-to-head.service';
import { match, race } from '@/features/stats/services/stats-fixtures';

describe('headToHead', () => {
  it('counts wins and frames from A side whichever team A was on', () => {
    const h = headToHead(
      'a',
      'b',
      [
        match(['a'], ['b'], { day: 1, frames: [2, 1] }),
        match(['b'], ['a'], { day: 2, winner: 'b', frames: [0, 2] }),
        match(['b'], ['a'], { day: 3, winner: 'b', frames: [1, 3] }),
      ],
      [],
    );
    expect(h.matchesPlayed).toBe(3);
    expect(h.aWins).toBe(3);
    expect(h.bWins).toBe(0);
    expect(h.aFrames).toBe(2 + 2 + 3);
    expect(h.bFrames).toBe(1 + 0 + 1);
  });

  it('keeps partner matches separate from meetings', () => {
    const h = headToHead('a', 'b', [match(['a', 'b'], ['c', 'd'])], []);
    expect(h.matchesPlayed).toBe(0);
    expect(h.partnerPlayed).toBe(1);
    expect(h.partnerWins).toBe(1);
    expect(h.meetings).toHaveLength(0);
  });

  it('compares race places, newest meeting first', () => {
    const h = headToHead(
      'a',
      'b',
      [match(['a'], ['b'], { day: 1 })],
      [race({ a: 3, b: 1 }, 5), race({ a: 2, b: 'dnf' }, 6)],
    );
    expect(h.racesShared).toBe(2);
    expect(h.aAhead).toBe(1);
    expect(h.bAhead).toBe(1);
    expect(h.meetings.map((m) => m.score)).toEqual(['2nd v DNF', '3rd v 1st', '2-0']);
  });

  it('is empty for two players who never met, and for a player with themself', () => {
    expect(headToHead('a', 'b', [match(['a'], ['c'])], []).matchesPlayed).toBe(0);
    expect(headToHead('a', 'a', [match(['a'], ['b'])], []).meetings).toHaveLength(0);
  });
});

describe('findRivals', () => {
  it('finds best partner, nemesis, favourite opponent and most played', () => {
    const rivals = findRivals('a', [
      match(['a', 'p'], ['x', 'y'], { day: 1 }),
      match(['a', 'p'], ['x', 'z'], { day: 2 }),
      match(['a'], ['n'], { day: 3, winner: 'b' }),
      match(['a'], ['n'], { day: 4, winner: 'b' }),
      match(['a'], ['x'], { day: 5 }),
    ]);
    expect(rivals.bestPartner?.playerId).toBe('p');
    expect(rivals.nemesis?.playerId).toBe('n');
    expect(rivals.favouriteOpponent?.playerId).toBe('x');
    expect(rivals.mostPlayed?.playerId).toBe('x');
    expect(rivals.mostPlayed?.played).toBe(3);
  });

  it('needs at least two meetings before naming a nemesis', () => {
    const rivals = findRivals('a', [match(['a'], ['n'], { winner: 'b' })]);
    expect(rivals.nemesis).toBeNull();
    expect(rivals.mostPlayed?.playerId).toBe('n');
  });
});
