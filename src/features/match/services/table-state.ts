import { FULL_RACK_REDS, type BallValue, type OpenFrame, type Shot } from '@/shared/types/domain';

/**
 * What the striker is "on" next, per the rules of snooker:
 * - red: a red (any reds left)
 * - colour: any colour, after potting a red (or a free ball as red)
 * - clearance: the colours in order, yellow (2) to black (7), once the reds are gone
 * - cleared: every ball is off the table
 */
export type BallOn =
  | { kind: 'red' }
  | { kind: 'colour' }
  | { kind: 'clearance'; ball: ColourValue }
  | { kind: 'cleared' };

export type ColourValue = 2 | 3 | 4 | 5 | 6 | 7;

export interface TableState {
  redsLeft: number;
  on: BallOn;
  /** Maximum points still available to the side at the table (for "snookers needed"). */
  pointsRemaining: number;
}

interface TableSeed {
  startingReds?: number;
  redsRemoved?: number;
}

function clampReds(n: number): number {
  return Math.max(0, Math.min(FULL_RACK_REDS, Math.floor(n)));
}

/** Ball on once a visit ends (miss, safety or foul). */
function onAfterVisitEnds(redsLeft: number, on: BallOn): BallOn {
  if (redsLeft > 0) {
    return { kind: 'red' };
  }
  if (on.kind === 'colour' || on.kind === 'red') {
    return { kind: 'clearance', ball: 2 };
  }
  return on;
}

function nextColour(ball: ColourValue): BallOn {
  return ball === 7 ? { kind: 'cleared' } : { kind: 'clearance', ball: (ball + 1) as ColourValue };
}

function onAfterPot(redsLeft: number, on: BallOn, ball: BallValue): BallOn {
  if (ball === 1) {
    return { kind: 'colour' };
  }
  if (on.kind === 'colour') {
    return redsLeft > 0 ? { kind: 'red' } : { kind: 'clearance', ball: 2 };
  }
  if (on.kind === 'clearance') {
    // Logged out of order (scorer tapped a different colour): follow the ball actually potted.
    return ball >= on.ball ? nextColour(ball as ColourValue) : on;
  }
  // A colour logged while on a red: treat it as the colour after an unlogged red.
  return redsLeft > 0 ? { kind: 'red' } : { kind: 'clearance', ball: 2 };
}

/** Sum of colour values from `from` up to black. */
function colourSum(from: ColourValue): number {
  let total = 0;
  for (let v = from; v <= 7; v += 1) {
    total += v;
  }
  return total;
}

export function pointsRemainingFor(redsLeft: number, on: BallOn): number {
  switch (on.kind) {
    case 'red':
      return redsLeft * 8 + colourSum(2);
    case 'colour':
      return 7 + redsLeft * 8 + colourSum(2);
    case 'clearance':
      return colourSum(on.ball);
    case 'cleared':
      return 0;
  }
}

/** Replay a frame's shots to find reds left and the ball on. Pure and order-dependent. */
export function tableStateFromShots(shots: Shot[], seed: TableSeed = {}): TableState {
  let redsLeft = clampReds((seed.startingReds ?? FULL_RACK_REDS) - (seed.redsRemoved ?? 0));
  let on: BallOn = redsLeft > 0 ? { kind: 'red' } : { kind: 'clearance', ball: 2 };

  for (const shot of shots) {
    if (on.kind === 'cleared') {
      break;
    }
    if (shot.kind === 'pot') {
      const ball = shot.ball ?? (shot.points as BallValue);
      if (ball === 1) {
        redsLeft = Math.max(0, redsLeft - 1);
      }
      on = onAfterPot(redsLeft, on, ball);
    } else if (shot.kind === 'free_ball') {
      // A free ball counts as the ball on without removing a red.
      if (on.kind === 'red') {
        on = { kind: 'colour' };
      }
    } else {
      on = onAfterVisitEnds(redsLeft, on);
    }
  }

  return { redsLeft, on, pointsRemaining: pointsRemainingFor(redsLeft, on) };
}

export function tableStateOf(open: OpenFrame): TableState {
  return tableStateFromShots(open.shots, {
    startingReds: open.startingReds,
    redsRemoved: open.redsRemoved,
  });
}

/** True when potting `ball` now is a legal, expected pot (used to highlight the ball pad). */
export function isBallOn(state: TableState, ball: BallValue): boolean {
  switch (state.on.kind) {
    case 'red':
      return ball === 1;
    case 'colour':
      return ball !== 1;
    case 'clearance':
      return ball === state.on.ball;
    case 'cleared':
      return false;
  }
}

/** Value a free ball is worth right now (it takes the value of the ball on). */
export function freeBallValue(state: TableState): BallValue {
  if (state.on.kind === 'clearance') {
    return state.on.ball;
  }
  return 1;
}

export function describeBallOn(state: TableState): string {
  switch (state.on.kind) {
    case 'red':
      return state.redsLeft === 1 ? 'On: last red' : 'On: a red';
    case 'colour':
      return 'On: any colour';
    case 'clearance':
      return `On: ${COLOUR_NAMES[state.on.ball]}`;
    case 'cleared':
      return 'Table cleared';
  }
}

const COLOUR_NAMES: Record<ColourValue, string> = {
  2: 'yellow',
  3: 'green',
  4: 'brown',
  5: 'blue',
  6: 'pink',
  7: 'black',
};
