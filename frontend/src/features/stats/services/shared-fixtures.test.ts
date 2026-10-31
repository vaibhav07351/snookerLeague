import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it, jest } from '@jest/globals';

import { computeRatings } from '@/features/stats/services/rating.service';
import {
  recomputeRaceStats,
  recomputeStandardStats,
} from '@/features/stats/services/stats.service';
import type { Match, Race } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The server (backend/internal/stats) computes the same numbers in Go. Both test suites read
 * fixtures/stats/cases.json, so the app and the server can never disagree. After changing the
 * stats or rating rules on purpose, run this test once with WRITE_FIXTURES=1 to refresh
 * "expected", then make the Go side pass again.
 */
const FIXTURE = join(__dirname, '../../../../../fixtures/stats/cases.json');

interface Fixture {
  players: string[];
  matches: Match[];
  races: Race[];
  expected: unknown;
}

function compute(f: Fixture): unknown {
  const ratings = computeRatings(f.matches, f.races);
  return {
    standard: Object.fromEntries(
      f.players.map((id) => [id, recomputeStandardStats(id, f.matches)]),
    ),
    race: Object.fromEntries(f.players.map((id) => [id, recomputeRaceStats(id, f.races)])),
    ratings: Object.fromEntries([...ratings.values()].map((r) => [r.playerId, r])),
  };
}

describe('shared stats fixtures', () => {
  it('match the expected numbers the server also checks', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    const actual = compute(fixture);
    if (process.env.WRITE_FIXTURES === '1') {
      writeFileSync(FIXTURE, `${JSON.stringify({ ...fixture, expected: actual }, null, 2)}\n`);
      return;
    }
    expect(actual).toEqual(fixture.expected);
  });
});
