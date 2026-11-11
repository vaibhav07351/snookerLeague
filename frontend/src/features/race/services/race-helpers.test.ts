import { describe, expect, it } from '@jest/globals';

import { raceDurationSeconds, raceStartedAt } from '@/features/race/services/race-helpers';
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
