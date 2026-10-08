import { describe, expect, it } from '@jest/globals';

import {
  canManageMatch,
  canTakeOverScoring,
  isMatchScorer,
} from '@/features/match/services/match-access';
import type { Match } from '@/shared/types/domain';

function match(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    leagueId: 'l1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdByUid: 'creator',
    teamA: ['p1'],
    teamB: ['p2'],
    bestOf: 3,
    namedLabel: null,
    crownsChampion: false,
    frames: [],
    outcome: { status: 'in_progress', framesA: 0, framesB: 0 },
    ...overrides,
  };
}

const league = { createdByUid: 'owner', memberUids: ['owner', 'creator', 'member', 'friend'] };

describe('match access', () => {
  it('defaults the scorer to the creator', () => {
    expect(isMatchScorer(match(), 'creator')).toBe(true);
    expect(isMatchScorer(match({ scorerUid: 'member' }), 'creator')).toBe(false);
  });

  it('lets any member take over by default, but not outsiders', () => {
    expect(canTakeOverScoring(match(), league, 'member')).toBe(true);
    expect(canTakeOverScoring(match(), league, 'stranger')).toBe(false);
    expect(canTakeOverScoring(match(), league, 'creator')).toBe(false);
  });

  it('limits takeover to chosen people when the policy is "chosen"', () => {
    const m = match({ scoringPolicy: 'chosen', allowedScorerUids: ['friend'] });
    expect(canTakeOverScoring(m, league, 'member')).toBe(false);
    expect(canTakeOverScoring(m, league, 'friend')).toBe(true);
    expect(canTakeOverScoring(m, league, 'owner')).toBe(true);
  });

  it('never allows takeover of a finished match', () => {
    const m = match({ outcome: { status: 'completed', winner: 'a', framesA: 2, framesB: 0 } });
    expect(canTakeOverScoring(m, league, 'member')).toBe(false);
  });

  it('creator and league owner can manage', () => {
    expect(canManageMatch(match(), league, 'creator')).toBe(true);
    expect(canManageMatch(match(), league, 'owner')).toBe(true);
    expect(canManageMatch(match(), league, 'member')).toBe(false);
  });
});
