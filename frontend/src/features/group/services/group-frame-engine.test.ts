import { describe, expect, it } from '@jest/globals';

import {
  applyFoul,
  atTableAfter,
  frameLeaders,
  groupMatchWinner,
  groupStandings,
  highestBreaksOf,
  nextBreakerId,
  replayGroupFrame,
} from '@/features/group/services/group-frame-engine';
import type { BallValue, GroupFrame, GroupShot, ShotKind } from '@/shared/types/domain';

const PLAYERS = ['ravi', 'amit', 'sunil'];

let seq = 0;
function shot(playerId: string, kind: ShotKind, points: number, ball?: BallValue): GroupShot {
  seq += 1;
  return { id: `g${seq}`, at: '2026-11-05T10:00:00.000Z', playerId, kind, points, ball };
}
const pot = (playerId: string, ball: BallValue): GroupShot => shot(playerId, 'pot', ball, ball);
const foul = (playerId: string, points: number): GroupShot => shot(playerId, 'foul', points);
const miss = (playerId: string): GroupShot => shot(playerId, 'miss', 0);

function frame(winnerId: string, points: Record<string, number>): GroupFrame {
  return { winnerId, points, breakerId: null };
}

describe('applyFoul', () => {
  it('takes the whole foul from a fouler who can pay it', () => {
    expect(applyFoul({ ravi: 10, amit: 3, sunil: 0 }, 'ravi', 6)).toEqual({
      ravi: 4,
      amit: 3,
      sunil: 0,
    });
  });

  it('drops a short fouler to zero and gives the rest to everyone else', () => {
    expect(applyFoul({ ravi: 1, amit: 4, sunil: 7 }, 'amit', 6)).toEqual({
      ravi: 3,
      amit: 0,
      sunil: 9,
    });
  });

  it('gives the full foul to everyone else when the fouler has nothing', () => {
    expect(applyFoul({ ravi: 0, amit: 0, sunil: 5 }, 'ravi', 4)).toEqual({
      ravi: 0,
      amit: 4,
      sunil: 9,
    });
  });

  it('always leaves the fouler exactly the foul value further behind each opponent', () => {
    const before = { ravi: 4, amit: 10, sunil: 2 };
    const after = applyFoul(before, 'ravi', 6);
    for (const id of ['amit', 'sunil'] as const) {
      const gap = (after[id] ?? 0) - (after.ravi ?? 0) - (before[id] - before.ravi);
      expect(gap).toBe(6);
    }
  });
});

describe('replayGroupFrame', () => {
  it('adds pots to the shooter and tracks the running break', () => {
    const score = replayGroupFrame([pot('ravi', 1), pot('ravi', 7), pot('ravi', 1)], PLAYERS);
    expect(score.points).toEqual({ ravi: 9, amit: 0, sunil: 0 });
    expect(score.currentBreak).toBe(9);
    expect(score.breakPlayerId).toBe('ravi');
  });

  it('applies fouls in order and ends the break', () => {
    const score = replayGroupFrame(
      [pot('ravi', 1), pot('ravi', 2), miss('ravi'), pot('amit', 1), foul('amit', 4)],
      PLAYERS,
    );
    // Amit had 1, pays 1, short 3: Ravi 3 + 3, Sunil 0 + 3.
    expect(score.points).toEqual({ ravi: 6, amit: 0, sunil: 3 });
    expect(score.foulPoints).toEqual({ ravi: 0, amit: 4, sunil: 0 });
    expect(score.currentBreak).toBe(0);
  });

  it('never produces a negative score', () => {
    const score = replayGroupFrame([foul('sunil', 7), foul('sunil', 7)], PLAYERS);
    expect(Math.min(...Object.values(score.points))).toBe(0);
    expect(score.points).toEqual({ ravi: 14, amit: 14, sunil: 0 });
  });

  it('ignores shots by players not in the match', () => {
    expect(replayGroupFrame([pot('ghost', 7)], PLAYERS).points).toEqual({
      ravi: 0,
      amit: 0,
      sunil: 0,
    });
  });
});

describe('atTableAfter', () => {
  const order = ['ravi', 'sunil', 'amit'];

  it('keeps the shooter on after a pot', () => {
    expect(atTableAfter(pot('sunil', 1), order, PLAYERS)).toBe('sunil');
  });

  it('passes to the next seat after a miss or foul', () => {
    expect(atTableAfter(miss('ravi'), order, PLAYERS)).toBe('sunil');
    expect(atTableAfter(foul('amit', 4), order, PLAYERS)).toBe('ravi');
  });
});

describe('frameLeaders', () => {
  it('returns the single leader or every tied player', () => {
    expect(frameLeaders({ ravi: 40, amit: 52, sunil: 18 })).toEqual(['amit']);
    expect(frameLeaders({ ravi: 40, amit: 40, sunil: 18 })).toEqual(['ravi', 'amit']);
  });
});

describe('highestBreaksOf', () => {
  it('keeps the best visit per player', () => {
    const shots = [pot('ravi', 1), pot('ravi', 7), miss('ravi'), pot('amit', 1), miss('amit')];
    shots.push(pot('ravi', 1), pot('ravi', 5), pot('ravi', 1), pot('ravi', 6));
    expect(highestBreaksOf(shots)).toEqual({ ravi: 13, amit: 1 });
  });
});

describe('nextBreakerId', () => {
  const order = ['ravi', 'sunil', 'amit'];

  it('starts with the first seat and rotates after each frame', () => {
    expect(nextBreakerId([], order, PLAYERS)).toBe('ravi');
    const f = { ...frame('ravi', {}), breakerId: 'ravi' };
    expect(nextBreakerId([f], order, PLAYERS)).toBe('sunil');
  });
});

describe('groupMatchWinner', () => {
  it('stays open while someone can still catch the leader', () => {
    const frames = [frame('ravi', { ravi: 50, amit: 20, sunil: 10 })];
    expect(groupMatchWinner(frames, 3, PLAYERS)).toBeNull();
  });

  it('ends once nobody can catch the leader', () => {
    const frames = [
      frame('ravi', { ravi: 50, amit: 20, sunil: 10 }),
      frame('ravi', { ravi: 60, amit: 20, sunil: 10 }),
    ];
    expect(groupMatchWinner(frames, 3, PLAYERS)).toBe('ravi');
  });

  it('plays a decider when the planned frames end level at the top', () => {
    const level = [
      frame('ravi', { ravi: 50, amit: 20, sunil: 10 }),
      frame('amit', { ravi: 20, amit: 60, sunil: 10 }),
      frame('sunil', { ravi: 20, amit: 10, sunil: 70 }),
    ];
    expect(groupMatchWinner(level, 3, PLAYERS)).toBeNull();
    const decided = [...level, frame('amit', { ravi: 5, amit: 40, sunil: 30 })];
    expect(groupMatchWinner(decided, 3, PLAYERS)).toBe('amit');
  });
});

describe('groupStandings', () => {
  it('orders by frames won, then total points', () => {
    const rows = groupStandings(
      [
        frame('sunil', { ravi: 52, amit: 18, sunil: 60 }),
        frame('ravi', { ravi: 40, amit: 30, sunil: 20 }),
      ],
      PLAYERS,
    );
    expect(rows.map((r) => r.playerId)).toEqual(['ravi', 'sunil', 'amit']);
    expect(rows[0]).toEqual({ playerId: 'ravi', framesWon: 1, points: 92 });
  });
});
