import { describe, expect, it } from '@jest/globals';

import {
  raceDurationSeconds,
  raceShotSummary,
  raceStartedAt,
} from '@/features/race/services/race-helpers';
import type { Race, RaceLiveShot } from '@/shared/types/domain';

function race(overrides: Partial<Race> = {}): Race {
  return {
    id: 'rc1',
    leagueId: 'l1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:30:00.000Z',
    createdByUid: 'u1',
    targetScore: 50,
    namedLabel: null,
    crownsRaceChampion: false,
    entrants: [
      { playerId: 'a', score: 0, place: null, finishedAt: null },
      { playerId: 'b', score: 0, place: null, finishedAt: null },
    ],
    status: 'in_progress',
    liveShots: [],
    ...overrides,
  };
}

const shot = (at: string): RaceLiveShot => ({
  id: `s-${at}`,
  at,
  playerId: 'a',
  kind: 'pot',
  points: 7,
  ball: 7,
});

describe('raceStartedAt', () => {
  it('is null before the first shot', () => {
    expect(raceStartedAt(race())).toBeNull();
  });

  it('is the first shot time', () => {
    const shots = [shot('2026-11-11T10:05:00.000Z'), shot('2026-11-11T10:06:00.000Z')];
    expect(raceStartedAt(race({ liveShots: shots }))).toBe('2026-11-11T10:05:00.000Z');
  });
});

describe('raceDurationSeconds', () => {
  it('is null while the race is in progress', () => {
    expect(raceDurationSeconds(race({ liveShots: [shot('2026-11-11T10:05:00.000Z')] }))).toBe(null);
  });

  it('runs from the first shot to the latest finish', () => {
    const done = race({
      status: 'completed',
      liveShots: [shot('2026-11-11T10:05:00.000Z')],
      entrants: [
        { playerId: 'a', score: 50, place: 1, finishedAt: '2026-11-11T10:17:30.000Z' },
        { playerId: 'b', score: 20, place: 2, finishedAt: '2026-11-11T10:20:00.000Z' },
      ],
    });
    expect(raceDurationSeconds(done)).toBe(15 * 60);
  });

  it('starts at creation for races scored by typing totals', () => {
    const done = race({
      status: 'completed',
      entrants: [
        { playerId: 'a', score: 50, place: 1, finishedAt: '2026-11-11T10:10:00.000Z' },
        { playerId: 'b', score: 20, place: 2, finishedAt: '2026-11-11T10:10:00.000Z' },
      ],
    });
    expect(raceDurationSeconds(done)).toBe(10 * 60);
  });

  it('is null when a stored time cannot be read', () => {
    expect(raceDurationSeconds(race({ status: 'completed', createdAt: 'bad' }))).toBeNull();
  });
});

describe('raceShotSummary', () => {
  const at = '2026-11-11T10:05:00.000Z';
  const log = (
    playerId: string,
    kind: RaceLiveShot['kind'],
    ball?: RaceLiveShot['ball'],
  ): RaceLiveShot => ({
    id: `${playerId}-${kind}-${ball ?? 0}`,
    at,
    playerId,
    kind,
    points: kind === 'pot' ? (ball === 1 ? 10 : (ball ?? 0)) : kind === 'foul' ? 4 : 0,
    ...(ball ? { ball } : {}),
  });

  it('is empty without shots', () => {
    expect(raceShotSummary(undefined)).toEqual({});
  });

  it('counts reds, misses, safeties and the best visit per player', () => {
    const summary = raceShotSummary([
      log('a', 'pot', 1),
      log('a', 'pot', 7),
      log('a', 'pot', 1),
      log('a', 'safety'),
      log('b', 'pot', 2),
      log('b', 'miss'),
      log('a', 'pot', 1),
      log('a', 'foul'),
      log('b', 'safety'),
    ]);
    expect(summary).toEqual({
      a: { reds: 3, bestBreak: 27, misses: 0, safeties: 1 },
      b: { reds: 0, bestBreak: 2, misses: 1, safeties: 1 },
    });
  });

  it('starts a new visit when another player pots', () => {
    const summary = raceShotSummary([log('a', 'pot', 5), log('b', 'pot', 6), log('a', 'pot', 5)]);
    expect(summary.a?.bestBreak).toBe(5);
    expect(summary.b?.bestBreak).toBe(6);
  });
});
