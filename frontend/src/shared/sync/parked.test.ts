import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PullPage, PushResult, ServerDoc } from '@/shared/api/sync-api';
import type { PendingOp, Player, SessionUser } from '@/shared/types/domain';
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
jest.mock('@/shared/sync/cloud-session', () => ({
  shouldCloudSync: (user: { isDemo: boolean } | null) => user != null && !user.isDemo,
}));
jest.mock('@/shared/sync/connectivity', () => ({ isOnline: () => true }));

const mockPushOps = jest.fn<(ops: { opId: string }[]) => Promise<PushResult[]>>();
const mockPullPage = jest.fn<(since: number, leagueId?: string) => Promise<PullPage>>();
jest.mock('@/shared/api/sync-api', () => ({
  pushOps: (ops: { opId: string }[]) => mockPushOps(ops),
  pullPage: (since: number, leagueId?: string) => mockPullPage(since, leagueId),
  fetchInvite: jest.fn(),
  joinCityHub: jest.fn(),
  leaveLeague: jest.fn(),
}));

type Store = typeof import('@/shared/storage/local-store');
type Parked = typeof import('@/shared/sync/parked');
type Apply = typeof import('@/shared/sync/apply');
type Client = typeof import('@/shared/api/client');

interface Mods {
  store: Store;
  parked: Parked;
  apply: Apply;
  client: Client;
}

function fresh(): Mods {
  let mods: Mods | undefined;
  jest.isolateModules(() => {
    mods = {
      store: require('@/shared/storage/local-store') as Store,
      parked: require('@/shared/sync/parked') as Parked,
      apply: require('@/shared/sync/apply') as Apply,
      client: require('@/shared/api/client') as Client,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

const user: SessionUser = {
  uid: 'u1',
  displayName: 'Asha',
  email: null,
  photoUrl: null,
  isDemo: false,
  cityId: null,
  cityName: null,
};

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

function playerDoc(p: Player, version: number): ServerDoc {
  return {
    entity: 'player',
    id: p.id,
    leagueId: p.leagueId,
    version,
    deleted: false,
    data: p as unknown as Record<string, unknown>,
    updatedAt: p.updatedAt,
  };
}

function parkedOp(p: Player): PendingOp {
  return {
    opId: `op_${p.id}`,
    entity: 'player',
    docId: p.id,
    leagueId: p.leagueId,
    action: 'upsert',
    payload: p,
    updatedAt: p.updatedAt,
    attempts: 3,
    failures: 2,
    uid: 'u1',
    parked: { reason: 'rejected', code: 'forbidden', message: 'No', at: '2026-11-12T00:00:00Z' },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPushOps.mockReset();
  mockPullPage.mockReset();
});

describe('applyServerDocs versions', () => {
  it('keeps the old version while a local write is queued, so the upload merges', async () => {
    const { store, apply } = fresh();
    await store.loadStore();
    const mine = player({ displayName: 'Mine', updatedAt: '2026-10-05T00:00:00.000Z' });
    await store.updateStore((s) => ({
      ...s,
      players: [mine],
      serverVersions: { 'player:p1': 3 },
      pendingOps: [{ ...parkedOp(mine), parked: undefined }],
    }));

    await apply.applyServerDocs([playerDoc(player({ displayName: 'Theirs' }), 8)]);

    expect(store.getStore().players[0]!.displayName).toBe('Mine');
    expect(store.getStore().serverVersions['player:p1']).toBe(3);
  });

  it('records the version when the server copy is taken', async () => {
    const { store, apply } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({
      ...s,
      players: [player()],
      serverVersions: { 'player:p1': 3 },
    }));
    const theirs = player({ displayName: 'Theirs', updatedAt: '2026-10-09T00:00:00.000Z' });

    await apply.applyServerDocs([playerDoc(theirs, 8)]);

    expect(store.getStore().players[0]!.displayName).toBe('Theirs');
    expect(store.getStore().serverVersions['player:p1']).toBe(8);
  });

  it('ignores an older copy that arrives after a newer one', async () => {
    const { store, apply } = fresh();
    await store.loadStore();
    const newer = player({ displayName: 'New', updatedAt: '2026-10-09T00:00:00.000Z' });
    await apply.applyServerDocs([playerDoc(newer, 9)]);

    await apply.applyServerDocs([playerDoc(player({ displayName: 'Old' }), 4)]);

    expect(store.getStore().players[0]!.displayName).toBe('New');
    expect(store.getStore().serverVersions['player:p1']).toBe(9);
  });
});

describe('set-aside writes', () => {
  it("lists only the signed-in account's set-aside writes", () => {
    const { parked, store } = fresh();
    const mine = parkedOp(player());
    const other = { ...parkedOp(player({ id: 'p2' })), uid: 'u2' };
    const queued = { ...parkedOp(player({ id: 'p3' })), parked: undefined };
    const s = { ...store.emptyStore(), user, pendingOps: [mine, other, queued] };

    expect(parked.parkedWritesOf(s).map((o) => o.opId)).toEqual(['op_p1']);
  });

  it("counts the signed-in account's queued writes as waiting, never the set-aside ones", () => {
    const { parked, store } = fresh();
    const setAside = parkedOp(player());
    const queued = { ...parkedOp(player({ id: 'p2' })), parked: undefined };
    const untagged = { ...parkedOp(player({ id: 'p3' })), parked: undefined, uid: undefined };
    const other = { ...parkedOp(player({ id: 'p4' })), parked: undefined, uid: 'u2' };
    const s = { ...store.emptyStore(), user, pendingOps: [setAside, queued, untagged, other] };

    expect(parked.waitingWritesOf(s).map((o) => o.opId)).toEqual(['op_p2', 'op_p3']);
    expect(parked.waitingWritesOf({ ...s, user: null })).toEqual([]);
  });

  it('Retry puts the write back in the queue and sends it', async () => {
    const { store, parked } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, user, pendingOps: [parkedOp(player())] }));
    mockPushOps.mockImplementation(async (ops) =>
      ops.map((o) => ({ opId: o.opId, status: 'applied' as const, version: 5 })),
    );

    await parked.retryParkedWrites();

    expect(mockPushOps).toHaveBeenCalledTimes(1);
    expect(store.getStore().pendingOps).toEqual([]);
  });

  it("Discard restores the server's copy and removes rows the server never had", async () => {
    const { store, parked } = fresh();
    await store.loadStore();
    const edited = player({ displayName: 'Mine', updatedAt: '2026-11-11T00:00:00.000Z' });
    const neverSaved = player({ id: 'p9', displayName: 'New guest' });
    await store.updateStore((s) => ({
      ...s,
      user,
      players: [edited, neverSaved],
      serverVersions: { 'player:p1': 2 },
      pendingOps: [parkedOp(edited), parkedOp(neverSaved)],
    }));
    mockPullPage.mockResolvedValue({
      docs: [playerDoc(player({ displayName: 'Online' }), 7)],
      cursor: 7,
      hasMore: false,
    });

    await parked.discardParkedWrites();

    const s = store.getStore();
    expect(mockPullPage).toHaveBeenCalledWith(0, 'lg1');
    expect(s.pendingOps).toEqual([]);
    expect(s.players.map((p) => [p.id, p.displayName])).toEqual([['p1', 'Online']]);
    expect(s.serverVersions['player:p1']).toBe(7);
  });

  it('Discard changes nothing when the server copy cannot be fetched', async () => {
    const { store, parked, client } = fresh();
    await store.loadStore();
    const edited = player({ displayName: 'Mine' });
    await store.updateStore((s) => ({
      ...s,
      user,
      players: [edited],
      pendingOps: [parkedOp(edited)],
    }));
    mockPullPage.mockRejectedValue(new client.NetworkError('Network request failed'));

    await expect(parked.discardParkedWrites()).rejects.toThrow('Network request failed');

    const s = store.getStore();
    expect(s.pendingOps).toHaveLength(1);
    expect(s.players[0]!.displayName).toBe('Mine');
  });
});
