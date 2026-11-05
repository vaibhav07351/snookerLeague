import { describe, expect, it, jest } from '@jest/globals';

import { finishedAtFor } from '@/features/match/services/match.service';
import { matchPlayedAt, type Match, type MatchOutcome } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({ scheduleSync: async () => undefined }));

const LIVE: MatchOutcome = { status: 'in_progress', framesA: 1, framesB: 1 };
const DONE: MatchOutcome = { status: 'completed', winner: 'a', framesA: 2, framesB: 1 };

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    leagueId: 'l1',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T11:00:00.000Z',
    createdByUid: 'u1',
    teamA: ['p1'],
    teamB: ['p2'],
    bestOf: 3,
    namedLabel: null,
    crownsChampion: true,
    frames: [],
    outcome: LIVE,
    ...overrides,
  };
}

const JULY = '2026-07-01T09:00:00.000Z';

describe('finishedAtFor', () => {
  it('stamps the time the result is decided', () => {
    expect(finishedAtFor(match(), DONE, JULY)).toBe(JULY);
  });

  it('keeps the original finish time when a finished match is edited later', () => {
    const march = match({ outcome: DONE, finishedAt: '2026-03-01T11:00:00.000Z' });
    expect(finishedAtFor(march, DONE, JULY)).toBe('2026-03-01T11:00:00.000Z');
  });

  it('uses the last save of a match finished before finish times existed', () => {
    const legacy = match({ outcome: DONE });
    expect(finishedAtFor(legacy, DONE, JULY)).toBe('2026-03-01T11:00:00.000Z');
  });

  it('clears it while the match is back in progress', () => {
    expect(finishedAtFor(match({ outcome: DONE, finishedAt: JULY }), LIVE, JULY)).toBeNull();
  });
});

describe('matchPlayedAt', () => {
  it('orders an edited March match before a June match', () => {
    const march = match({ finishedAt: '2026-03-01T11:00:00.000Z', updatedAt: JULY });
    const june = match({
      finishedAt: '2026-06-01T11:00:00.000Z',
      updatedAt: '2026-06-01T11:00:00.000Z',
    });
    expect(matchPlayedAt(march) < matchPlayedAt(june)).toBe(true);
  });
});
