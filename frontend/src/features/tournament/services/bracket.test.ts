import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from '@jest/globals';

import {
  deriveTournament,
  drawOrder,
  roundName,
  seedPositions,
} from '@/features/tournament/services/bracket';
import type { Match, Tournament } from '@/shared/types/domain';

/** Shared with the server (backend/internal/tournament); see "about" in the file. */
const FIXTURE = join(__dirname, '../../../../../fixtures/tournament/cases.json');

interface Fixture {
  cases: { tournament: Tournament; matches: Match[] }[];
  expected: unknown;
}

describe('tournament brackets', () => {
  it('seed top players apart', () => {
    expect(seedPositions(4)).toEqual([1, 4, 2, 3]);
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(roundName(2, 3)).toBe('Final');
    expect(roundName(0, 4)).toBe('Round of 16');
  });

  it('match the states the server also computes', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    const actual = fixture.cases.map((c) => deriveTournament(c.tournament, c.matches));
    if (process.env.WRITE_FIXTURES === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify({ ...fixture, expected: actual }, null, 2)}\n`);
      return;
    }
    expect(actual).toEqual(fixture.expected);
  });

  it('draw every player exactly once, in an order set by the random numbers', () => {
    const players = ['a', 'b', 'c', 'd', 'e'];
    const rolls = [0.9, 0.1, 0.5, 0.0];
    let i = 0;
    const drawn = drawOrder(players, () => rolls[i++] ?? 0);
    expect([...drawn].sort()).toEqual(players);
    // i=4 swaps with floor(0.9*5)=4 (stays): a b c d e; i=3 with 0: d b c a e;
    // i=2 with 1: d c b a e; i=1 with 0: c d b a e.
    expect(drawn).toEqual(['c', 'd', 'b', 'a', 'e']);
    expect(players).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('give every player a fair chance at the top seed', () => {
    const counts = new Map<string, number>();
    let seed = 7;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let n = 0; n < 4000; n += 1) {
      const top = drawOrder(['a', 'b', 'c', 'd'], random)[0]!;
      counts.set(top, (counts.get(top) ?? 0) + 1);
    }
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(counts.get(id)).toBeGreaterThan(850);
      expect(counts.get(id)).toBeLessThan(1150);
    }
  });
});
