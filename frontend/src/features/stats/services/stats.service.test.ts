import { describe, expect, it, jest } from '@jest/globals';

import { match, race } from '@/features/stats/services/stats-fixtures';
import {
  recomputeRaceStats,
  recomputeStandardStats,
} from '@/features/stats/services/stats.service';
import type { RaceLiveShot, Shot } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const AT = '2026-01-02T10:00:00.000Z';

function raceShot(
  playerId: string,
  kind: RaceLiveShot['kind'],
  ball?: RaceLiveShot['ball'],
): RaceLiveShot {
  const points = kind === 'pot' ? (ball === 1 ? 10 : (ball ?? 0)) : 0;
  return { id: `${playerId}-${kind}`, at: AT, playerId, kind, points, ...(ball ? { ball } : {}) };
}

describe('recomputeRaceStats shot numbers', () => {
  it('adds reds, misses and safeties over races and keeps the bests', () => {
    const first = race({ a: 1, b: 2 }, 1);
    first.liveShots = [
      raceShot('a', 'pot', 1),
      raceShot('a', 'pot', 1),
      raceShot('a', 'safety'),
      raceShot('b', 'miss'),
    ];
    const second = race({ a: 'dnf', b: 1 }, 2);
    second.liveShots = [
      raceShot('a', 'pot', 1),
      raceShot('a', 'pot', 7),
      raceShot('a', 'pot', 1),
      raceShot('a', 'pot', 1),
      raceShot('a', 'miss'),
    ];

    const stats = recomputeRaceStats('a', [first, second]);
    expect(stats.reds).toBe(5);
    expect(stats.mostRedsInRace).toBe(3);
    expect(stats.highestBreak).toBe(37);
    expect(stats.misses).toBe(1);
    expect(stats.safeties).toBe(1);
  });

  it('counts nothing for races scored by typing totals', () => {
    const stats = recomputeRaceStats('a', [race({ a: 1, b: 2 })]);
    expect(stats).toMatchObject({ reds: 0, mostRedsInRace: 0, misses: 0, safeties: 0 });
  });
});

describe('recomputeStandardStats misses and safeties', () => {
  it('counts each player their own misses and safeties', () => {
    const shot = (side: 'a' | 'b', kind: Shot['kind'], points = 0): Shot => ({
      id: `${side}-${kind}-${points}`,
      at: AT,
      side,
      kind,
      points,
    });
    const m = match(['a'], ['b']);
    m.frames = [
      {
        teamAPoints: 1,
        teamBPoints: 0,
        winner: 'a',
        shots: [shot('a', 'pot', 1), shot('a', 'safety'), shot('b', 'miss'), shot('a', 'miss')],
      },
    ];
    expect(recomputeStandardStats('a', [m])).toMatchObject({ misses: 1, safeties: 1 });
    expect(recomputeStandardStats('b', [m])).toMatchObject({ misses: 1, safeties: 0 });
  });
});
