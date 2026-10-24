import { describe, expect, it } from '@jest/globals';

import {
  describeBallOn,
  freeBallValue,
  isBallOn,
  tableStateFromShots,
} from '@/features/match/services/table-state';
import type { BallValue, Shot, ShotKind } from '@/shared/types/domain';

let seq = 0;
function shot(kind: ShotKind, ball?: BallValue, side: 'a' | 'b' = 'a'): Shot {
  seq += 1;
  const points = kind === 'foul' ? 4 : (ball ?? 0);
  return { id: `s${seq}`, at: '2026-01-01T00:00:00.000Z', side, kind, points, ball };
}
const pot = (ball: BallValue, side: 'a' | 'b' = 'a'): Shot => shot('pot', ball, side);

describe('tableStateFromShots', () => {
  it('starts on a red with 15 reds and 147 available', () => {
    const state = tableStateFromShots([]);
    expect(state.redsLeft).toBe(15);
    expect(state.on).toEqual({ kind: 'red' });
    expect(state.pointsRemaining).toBe(147);
    expect(isBallOn(state, 1)).toBe(true);
    expect(isBallOn(state, 7)).toBe(false);
  });

  it('is on any colour after a red, then back on a red', () => {
    const afterRed = tableStateFromShots([pot(1)]);
    expect(afterRed.on).toEqual({ kind: 'colour' });
    expect(afterRed.redsLeft).toBe(14);
    expect(isBallOn(afterRed, 1)).toBe(false);
    expect([2, 3, 4, 5, 6, 7].every((b) => isBallOn(afterRed, b as BallValue))).toBe(true);
    expect(tableStateFromShots([pot(1), pot(7)]).on).toEqual({ kind: 'red' });
  });

  it('next player is on a red after a miss following a red', () => {
    expect(tableStateFromShots([pot(1), shot('miss')]).on).toEqual({ kind: 'red' });
  });

  it('moves to the yellow after the colour following the last red', () => {
    const shots: Shot[] = [];
    for (let i = 0; i < 15; i += 1) {
      shots.push(pot(1), pot(7));
    }
    const state = tableStateFromShots(shots);
    expect(state.redsLeft).toBe(0);
    expect(state.on).toEqual({ kind: 'clearance', ball: 2 });
    expect(state.pointsRemaining).toBe(27);
  });

  it('goes to the yellow when the colour after the last red is missed', () => {
    const state = tableStateFromShots([pot(1), shot('miss')], { startingReds: 1 });
    expect(state.on).toEqual({ kind: 'clearance', ball: 2 });
  });

  it('follows the colours in order during the clearance', () => {
    const state = tableStateFromShots([pot(2), pot(3), pot(4)], { startingReds: 0 });
    expect(state.on).toEqual({ kind: 'clearance', ball: 5 });
    expect(isBallOn(state, 5)).toBe(true);
    expect(isBallOn(state, 6)).toBe(false);
    expect(describeBallOn(state)).toBe('On: blue');
  });

  it('is cleared after the black', () => {
    const state = tableStateFromShots([pot(2), pot(3), pot(4), pot(5), pot(6), pot(7)], {
      startingReds: 0,
    });
    expect(state.on).toEqual({ kind: 'cleared' });
    expect(state.pointsRemaining).toBe(0);
  });

  it('a free ball counts as a red without removing one', () => {
    const state = tableStateFromShots([shot('foul', undefined, 'b'), shot('free_ball', 1)]);
    expect(state.redsLeft).toBe(15);
    expect(state.on).toEqual({ kind: 'colour' });
  });

  it('a free ball in the clearance keeps the same colour on and is worth it', () => {
    const before = tableStateFromShots([pot(2), pot(3)], { startingReds: 0 });
    expect(freeBallValue(before)).toBe(4);
    const after = tableStateFromShots([pot(2), pot(3), shot('free_ball', 4)], { startingReds: 0 });
    expect(after.on).toEqual({ kind: 'clearance', ball: 4 });
  });

  it('applies reds removed by hand and mid-frame starts', () => {
    expect(tableStateFromShots([], { startingReds: 9 }).redsLeft).toBe(9);
    expect(tableStateFromShots([pot(1)], { startingReds: 15, redsRemoved: 3 }).redsLeft).toBe(11);
    expect(tableStateFromShots([], { startingReds: 2, redsRemoved: 5 }).redsLeft).toBe(0);
  });
});
