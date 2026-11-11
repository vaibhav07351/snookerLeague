import { describe, expect, it } from '@jest/globals';

import { tallyTurnEnds } from '@/shared/utils/shot-tally';

describe('tallyTurnEnds', () => {
  it('counts misses and safeties per player and ignores other shots', () => {
    const tally = tallyTurnEnds([
      { playerId: 'r', kind: 'pot' },
      { playerId: 'r', kind: 'miss' },
      { playerId: 's', kind: 'safety' },
      { playerId: 's', kind: 'safety' },
      { playerId: 's', kind: 'foul' },
      { playerId: 'r', kind: 'safety' },
    ]);
    expect(tally).toEqual({
      r: { misses: 1, safeties: 1 },
      s: { misses: 0, safeties: 2 },
    });
  });

  it('is empty for an empty log', () => {
    expect(tallyTurnEnds([])).toEqual({});
  });
});
