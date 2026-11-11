import { describe, expect, it, jest } from '@jest/globals';

// stats.service also persists to device storage; these tests only use its pure helpers.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { combinedFramePace } from '@/features/stats/services/frame-pace';
import { recomputeGroupStats } from '@/features/stats/services/stats.service';
import {
  emptyGroupStats,
  emptyStandardStats,
  type GroupFrame,
  type GroupMatch,
  type GroupStats,
} from '@/shared/types/domain';

function frame(winnerId: string, durationSeconds?: number): GroupFrame {
  return {
    points: { a: winnerId === 'a' ? 30 : 10, b: winnerId === 'b' ? 30 : 10, c: 5 },
    winnerId,
    breakerId: 'a',
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

function group(frames: GroupFrame[], status: GroupMatch['status'] = 'completed'): GroupMatch {
  return {
    id: 'g1',
    leagueId: 'l1',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T11:00:00.000Z',
    createdByUid: 'u1',
    playerIds: ['a', 'b', 'c'],
    turnOrder: ['a', 'b', 'c'],
    bestOf: 3,
    namedLabel: null,
    frames,
    openFrame: null,
    status,
    winnerId: 'a',
    finishedAt: '2026-11-11T11:00:00.000Z',
  };
}

describe('recomputeGroupStats frame times', () => {
  it('times free-for-all frames, split by frames won and lost', () => {
    const stats = recomputeGroupStats('a', [
      group([frame('a', 300), frame('b', 600), frame('a', 420), frame('a')]),
    ]);
    expect(stats.timedFrames).toBe(3);
    expect(stats.totalFrameSeconds).toBe(1320);
    expect(stats.timedFramesWon).toBe(2);
    expect(stats.winFrameSeconds).toBe(720);
    expect(stats.timedFramesLost).toBe(1);
    expect(stats.lossFrameSeconds).toBe(600);
    expect(stats.fastestFrameSeconds).toBe(300);
    expect(stats.slowestFrameSeconds).toBe(600);
  });

  it('ignores games still in progress', () => {
    const stats = recomputeGroupStats('a', [group([frame('a', 300)], 'in_progress')]);
    expect(stats.timedFrames).toBe(0);
    expect(stats.fastestFrameSeconds).toBeNull();
  });
});

describe('combinedFramePace', () => {
  it('uses match times alone when there are no free-for-all frames', () => {
    const s = {
      ...emptyStandardStats(),
      timedFrames: 2,
      totalFrameSeconds: 1000,
      avgFrameSeconds: 500,
      timedFramesWon: 1,
      avgWinFrameSeconds: 400,
      timedFramesLost: 1,
      avgLossFrameSeconds: 600,
      fastestFrameSeconds: 400,
      slowestFrameSeconds: 600,
    };
    expect(combinedFramePace(s, emptyGroupStats())).toEqual({
      timedFrames: 2,
      totalFrameSeconds: 1000,
      avgFrameSeconds: 500,
      avgWinFrameSeconds: 400,
      avgLossFrameSeconds: 600,
      fastestFrameSeconds: 400,
      slowestFrameSeconds: 600,
    });
  });

  it('adds free-for-all frames to the averages, fastest and slowest', () => {
    const s = {
      ...emptyStandardStats(),
      timedFrames: 2,
      totalFrameSeconds: 1000,
      avgFrameSeconds: 500,
      timedFramesWon: 1,
      avgWinFrameSeconds: 400,
      timedFramesLost: 1,
      avgLossFrameSeconds: 600,
      fastestFrameSeconds: 400,
      slowestFrameSeconds: 600,
    };
    const g: GroupStats = {
      ...emptyGroupStats(),
      timedFrames: 2,
      totalFrameSeconds: 1100,
      timedFramesWon: 1,
      winFrameSeconds: 200,
      timedFramesLost: 1,
      lossFrameSeconds: 900,
      fastestFrameSeconds: 200,
      slowestFrameSeconds: 900,
    };
    expect(combinedFramePace(s, g)).toEqual({
      timedFrames: 4,
      totalFrameSeconds: 2100,
      avgFrameSeconds: 525,
      avgWinFrameSeconds: 300,
      avgLossFrameSeconds: 750,
      fastestFrameSeconds: 200,
      slowestFrameSeconds: 900,
    });
  });

  it('reads stats saved before free-for-all frames were timed', () => {
    const old = {
      played: 1,
      wins: 1,
      winPct: 100,
      framesPlayed: 2,
      framesWon: 2,
      pointsScored: 60,
      highestBreak: 12,
      lastPlayedAt: null,
    } satisfies GroupStats;
    const pace = combinedFramePace(emptyStandardStats(), old);
    expect(pace.timedFrames).toBe(0);
    expect(pace.avgFrameSeconds).toBeNull();
    expect(pace.fastestFrameSeconds).toBeNull();
  });
});
