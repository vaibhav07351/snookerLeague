import { describe, expect, it } from '@jest/globals';

import { reconcileLeagueScoped, resolveLeague, resolveMatch } from '@/shared/sync/merge';
import type { League, Match } from '@/shared/types/domain';

function match(overrides: Partial<Match>): Match {
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

function league(overrides: Partial<League>): League {
  return {
    id: 'l1',
    name: 'Club',
    inviteCode: 'ABC234',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdByUid: 'owner',
    memberUids: ['owner'],
    defaultRaceTarget: 50,
    defaultBestOf: 3,
    reigningTeam: null,
    raceKing: null,
    ...overrides,
  };
}

describe('resolveMatch', () => {
  it("keeps the scorer's newer shots and the manager's newer title setting", () => {
    const scorerCopy = match({ updatedAt: '2026-01-01T00:05:00.000Z', bestOf: 3 });
    const managerCopy = match({
      updatedAt: '2026-01-01T00:03:00.000Z',
      crownsChampion: true,
      settingsUpdatedAt: '2026-01-01T00:03:00.000Z',
    });
    const merged = resolveMatch(scorerCopy, managerCopy, false);
    expect(merged.updatedAt).toBe('2026-01-01T00:05:00.000Z');
    expect(merged.crownsChampion).toBe(true);
  });

  it('applies a remote takeover even while local shots are still uploading', () => {
    const local = match({ updatedAt: '2026-01-01T00:05:00.000Z', scorerUid: 'me' });
    const remote = match({
      scorerUid: 'friend',
      settingsUpdatedAt: '2026-01-01T00:04:00.000Z',
    });
    const merged = resolveMatch(local, remote, true);
    expect(merged.scorerUid).toBe('friend');
    expect(merged.updatedAt).toBe('2026-01-01T00:05:00.000Z');
  });
});

describe('resolveLeague', () => {
  it('takes membership from the server even when the local copy is newer', () => {
    const local = league({ updatedAt: '2026-01-02T00:00:00.000Z', memberUids: ['owner'] });
    const remote = league({ memberUids: ['owner', 'friend'] });
    expect(resolveLeague(local, remote, false).memberUids).toEqual(['owner', 'friend']);
  });

  it('keeps local membership while a membership change is still queued', () => {
    const local = league({ memberUids: ['owner', 'me'] });
    const remote = league({ memberUids: ['owner'] });
    expect(resolveLeague(local, remote, true).memberUids).toEqual(['owner', 'me']);
  });
});

describe('reconcileLeagueScoped', () => {
  it('drops rows deleted remotely but keeps ones still waiting to upload', () => {
    const local = [
      match({ id: 'kept' }),
      match({ id: 'deleted' }),
      match({ id: 'new-offline' }),
      match({ id: 'other-league', leagueId: 'l2' }),
    ];
    const remote = [match({ id: 'kept' })];
    const ids = reconcileLeagueScoped(local, 'l1', remote, new Set(['new-offline']))
      .map((m) => m.id)
      .sort();
    expect(ids).toEqual(['kept', 'new-offline', 'other-league']);
  });
});
