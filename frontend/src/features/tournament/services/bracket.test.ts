import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from '@jest/globals';

import { deriveTournament, roundName, seedPositions } from '@/features/tournament/services/bracket';
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
});
