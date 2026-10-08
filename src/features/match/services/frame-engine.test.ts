import { describe, expect, it } from '@jest/globals';

import {
  frameSeedOf,
  highestBreakFromShots,
  newOpenFrame,
  nextBreakerSide,
  replayOpenFrame,
  type FrameSeed,
} from '@/features/match/services/frame-engine';
import type { BallValue, FrameScore, Shot, ShotKind } from '@/shared/types/domain';

const teams = { a: ['a1'], b: ['b1'] };
const doubles = { a: ['a1', 'a2'], b: ['b1', 'b2'] };

let seq = 0;
function shot(side: 'a' | 'b', kind: ShotKind, playerId: string, ball?: BallValue): Shot {
  seq += 1;
  const points = kind === 'foul' ? 4 : (ball ?? 0);
  return { id: `s${seq}`, at: '2026-01-01T00:00:00.000Z', side, kind, points, ball, playerId };
}

const seed = (overrides: Partial<FrameSeed> = {}): FrameSeed => ({
  breakerSide: 'a',
  breakerPlayerId: 'a1',
  startingReds: 15,
  redsRemoved: 0,
  ...overrides,
});

describe('replayOpenFrame', () => {
  it('keeps the breaker when every shot is undone (B broke off)', () => {
    const open = replayOpenFrame([], seed({ breakerSide: 'b', breakerPlayerId: 'b1' }), teams);
    expect(open.atTable).toBe('b');
    expect(open.atTablePlayerId).toBe('b1');
  });

  it('adds carried-in points to the frame score', () => {
    const open = replayOpenFrame(
      [shot('a', 'pot', 'a1', 1)],
      seed({ carriedPoints: { a: 34, b: 12 } }),
      teams,
    );
    expect(open.teamAPoints).toBe(35);
    expect(open.teamBPoints).toBe(12);
    expect(frameSeedOf(open).carriedPoints).toEqual({ a: 34, b: 12 });
  });

  it('tracks the break and hands the table over on a miss', () => {
    const open = replayOpenFrame(
      [shot('a', 'pot', 'a1', 1), shot('a', 'pot', 'a1', 7), shot('a', 'miss', 'a1')],
      seed(),
      teams,
    );
    expect(open.teamAPoints).toBe(8);
    expect(open.atTable).toBe('b');
    expect(open.currentBreak).toBe(0);
  });

  it('awards foul points to the opponent', () => {
    const open = replayOpenFrame([shot('a', 'foul', 'a1')], seed(), teams);
    expect(open.teamBPoints).toBe(4);
    expect(open.atTable).toBe('b');
  });

  it('rotates doubles partners when the visit returns to a side', () => {
    const open = replayOpenFrame(
      [shot('a', 'miss', 'a1'), shot('b', 'miss', 'b1')],
      seed(),
      doubles,
    );
    expect(open.atTable).toBe('a');
    expect(open.atTablePlayerId).toBe('a2');
  });
});

describe('breaks and breakers', () => {
  it('finds the highest break per side', () => {
    const shots = [
      shot('a', 'pot', 'a1', 1),
      shot('a', 'pot', 'a1', 7),
      shot('a', 'miss', 'a1'),
      shot('b', 'pot', 'b1', 1),
      shot('b', 'pot', 'b1', 5),
    ];
    expect(highestBreakFromShots(shots, 'a')).toBe(8);
    expect(highestBreakFromShots(shots, 'b')).toBe(6);
    expect(highestBreakFromShots(shots)).toBe(8);
  });

  it('alternates the break-off side frame to frame', () => {
    const frame = (breakerSide: 'a' | 'b', winner: 'a' | 'b'): FrameScore => ({
      teamAPoints: 0,
      teamBPoints: 0,
      winner,
      breakerSide,
    });
    expect(nextBreakerSide([])).toBe('a');
    expect(nextBreakerSide([frame('a', 'a')])).toBe('b');
    expect(nextBreakerSide([frame('a', 'a'), frame('b', 'a')])).toBe('a');
    // Legacy frames without a breaker: the loser breaks.
    expect(nextBreakerSide([{ teamAPoints: 0, teamBPoints: 0, winner: 'b' }])).toBe('a');
  });

  it('new frames start at the breaker with a full rack', () => {
    const open = newOpenFrame('b', doubles);
    expect(open.atTable).toBe('b');
    expect(open.atTablePlayerId).toBe('b1');
    expect(open.startingReds).toBe(15);
  });
});
