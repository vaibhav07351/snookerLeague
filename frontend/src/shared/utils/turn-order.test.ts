import { describe, expect, it } from '@jest/globals';

import { movePlayerAfter, nextInTurn, resolveTurnOrder } from '@/shared/utils/turn-order';

describe('resolveTurnOrder', () => {
  it('uses the listed order when nothing is saved', () => {
    expect(resolveTurnOrder(undefined, ['r', 'a', 's'])).toEqual(['r', 'a', 's']);
  });

  it('drops unknown and repeated ids and appends missing players', () => {
    expect(resolveTurnOrder(['s', 'x', 's', 'r'], ['r', 'a', 's'])).toEqual(['s', 'r', 'a']);
  });
});

describe('nextInTurn', () => {
  const order = ['r', 's', 'a', 'd'];

  it('moves to the next seat and wraps around', () => {
    expect(nextInTurn(order, order, 's')).toBe('a');
    expect(nextInTurn(order, order, 'd')).toBe('r');
  });

  it('skips players who are out', () => {
    expect(nextInTurn(order, ['r', 's', 'd'], 's')).toBe('d');
  });

  it('starts from the seat of a player who just finished', () => {
    expect(nextInTurn(order, ['r', 'a', 'd'], 's')).toBe('a');
  });

  it('returns the only player left, or null when nobody is active', () => {
    expect(nextInTurn(order, ['a'], 'a')).toBe('a');
    expect(nextInTurn(order, [], 'a')).toBeNull();
  });

  it('starts at the first seat when there is no previous player', () => {
    expect(nextInTurn(order, order, null)).toBe('r');
  });
});

describe('movePlayerAfter', () => {
  it('seats the picked player right after the previous one', () => {
    expect(movePlayerAfter(['r', 'a', 's', 'd'], 'r', 's')).toEqual(['r', 's', 'a', 'd']);
  });

  it('works across the wrap point', () => {
    expect(movePlayerAfter(['r', 'a', 's', 'd'], 'd', 's')).toEqual(['r', 'a', 'd', 's']);
  });

  it('leaves the order alone for the same player or unknown ids', () => {
    expect(movePlayerAfter(['r', 'a'], 'r', 'r')).toEqual(['r', 'a']);
    expect(movePlayerAfter(['r', 'a'], 'x', 'a')).toEqual(['r', 'a']);
  });
});
