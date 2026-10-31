import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PushResult, ServerDoc } from '@/shared/api/sync-api';
import type { League, PendingOp, Player } from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/api/tokens', () => ({
  getTokens: () => null,
  hasSessionFor: () => true,
  loadTokens: async () => null,
  saveTokens: async () => undefined,
  clearTokens: async () => undefined,
}));
jest.mock('@/shared/ui/notify', () => ({
  notify: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

const mockPushOps = jest.fn<(ops: unknown[]) => Promise<PushResult[]>>();
jest.mock('@/shared/api/sync-api', () => ({
  pushOps: (ops: unknown[]) => mockPushOps(ops),
  joinCityHub: jest.fn(),
  leaveLeague: jest.fn(),
}));

type Store = typeof import('@/shared/storage/local-store');
type Push = typeof import('@/shared/sync/push');
type Apply = typeof import('@/shared/sync/apply');

function fresh(): { store: Store; push: Push; apply: Apply } {
  let mods: { store: Store; push: Push; apply: Apply } | undefined;
  jest.isolateModules(() => {
    mods = {
      store: require('@/shared/storage/local-store') as Store,
      push: require('@/shared/sync/push') as Push,
      apply: require('@/shared/sync/apply') as Apply,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

function player(over: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    leagueId: 'lg1',
    displayName: 'Asha',
    kind: 'member',
    authUid: 'u1',
    photoUrl: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
    ...over,
  };
}

function serverDoc(entity: ServerDoc['entity'], data: object, version: number): ServerDoc {
  const d = data as { id: string; leagueId?: string };
  return {
    entity,
    id: d.id,
    leagueId: d.leagueId ?? d.id,
    version,
    deleted: false,
    data: data as Record<string, unknown>,
    updatedAt: '2026-10-31T00:00:00.000Z',
  };
}

function op(over: Partial<PendingOp>): PendingOp {
  return {
    opId: 'op1',
    entity: 'player',
    docId: 'p1',
    leagueId: 'lg1',
    action: 'upsert',
    payload: player(),
    updatedAt: '2026-10-01T00:00:00.000Z',
    attempts: 0,
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPushOps.mockReset();
});

describe('pushDocBatch', () => {
  it('sends the known server version and records the new one', async () => {
    const { store, push } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({
      ...s,
      players: [player()],
      serverVersions: { 'player:p1': 4 },
    }));
    mockPushOps.mockResolvedValue([{ opId: 'op1', status: 'applied', version: 9 }]);

    const [outcome] = await push.pushDocBatch([op({})]);

    expect(outcome).toEqual({ status: 'applied' });
    expect((mockPushOps.mock.calls[0]![0] as { baseVersion: number }[])[0]!.baseVersion).toBe(4);
    expect(store.getStore().serverVersions['player:p1']).toBe(9);
  });

  it('lays a stats-only write over the newer server copy instead of dropping it', async () => {
    const { store, push } = fresh();
    await store.loadStore();
    const mine = player({
      stats: { standard: { ...emptyStandardStats(), played: 3 }, race: emptyRaceStats() },
    });
    await store.updateStore((s) => ({ ...s, players: [mine], serverVersions: { 'player:p1': 1 } }));
    // Someone renamed the player on another phone meanwhile.
    const current = serverDoc(
      'player',
      player({ displayName: 'Asha K', updatedAt: '2026-10-30T00:00:00.000Z' }),
      5,
    );
    mockPushOps.mockResolvedValue([{ opId: 'op1', status: 'conflict', current }]);

    const [outcome] = await push.pushDocBatch([op({ payload: mine, fieldsOnly: ['stats'] })]);

    expect(outcome).toEqual({ status: 'retry' });
    const local = store.getStore().players[0]!;
    expect(local.displayName).toBe('Asha K'); // their rename is kept
    expect(local.stats.standard.played).toBe(3); // our stats are kept
    expect(store.getStore().serverVersions['player:p1']).toBe(5);
  });

  it('accepts a newer server copy of a whole document and stops sending', async () => {
    const { store, push } = fresh();
    await store.loadStore();
    const stale = player({ displayName: 'Old', updatedAt: '2026-10-02T00:00:00.000Z' });
    await store.updateStore((s) => ({ ...s, players: [stale] }));
    const current = serverDoc(
      'player',
      player({ displayName: 'New', updatedAt: '2026-10-30T00:00:00.000Z' }),
      7,
    );
    mockPushOps.mockResolvedValue([{ opId: 'op1', status: 'conflict', current }]);

    const [outcome] = await push.pushDocBatch([op({ payload: stale })]);

    expect(outcome).toEqual({ status: 'resolved' });
    expect(store.getStore().players[0]!.displayName).toBe('New');
  });

  it('reports a refused write and treats deleting a missing document as done', async () => {
    const { store, push } = fresh();
    await store.loadStore();
    mockPushOps.mockResolvedValue([
      { opId: 'op1', status: 'rejected', code: 'forbidden', message: 'No' },
      { opId: 'op2', status: 'rejected', code: 'not_found', message: 'Nothing to delete.' },
    ]);

    const outcomes = await push.pushDocBatch([
      op({}),
      op({ opId: 'op2', docId: 'p2', action: 'delete', payload: null }),
    ]);

    expect(outcomes[0]!.status).toBe('rejected');
    expect(outcomes[1]).toEqual({ status: 'resolved' });
  });
});

describe('applyServerDocs', () => {
  it('merges pulled rows, records versions and follows deletions', async () => {
    const { store, apply } = fresh();
    await store.loadStore();
    const league: League = {
      id: 'lg1',
      name: 'Club',
      inviteCode: 'ABC234',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      createdByUid: 'u1',
      memberUids: ['u1'],
      defaultRaceTarget: 50,
      defaultBestOf: 3,
      reigningTeam: null,
      raceKing: null,
      kind: 'club',
      cityId: null,
    };
    await store.updateStore((s) => ({ ...s, players: [player({ id: 'gone' })] }));

    await apply.applyServerDocs([
      serverDoc('league', { ...league, memberUids: ['u1', 'u2'] }, 2),
      serverDoc('player', player(), 3),
      { entity: 'player', id: 'gone', leagueId: 'lg1', version: 4, deleted: true, updatedAt: '' },
    ]);

    const s = store.getStore();
    expect(s.leagues[0]!.memberUids).toEqual(['u1', 'u2']);
    expect(s.players.map((p) => p.id)).toEqual(['p1']);
    expect(s.serverVersions).toEqual({ 'league:lg1': 2, 'player:p1': 3, 'player:gone': 4 });
  });
});
