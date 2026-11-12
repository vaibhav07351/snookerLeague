import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PushResult, ServerDoc } from '@/shared/api/sync-api';
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
let mockOnline = true;
jest.mock('@/shared/sync/connectivity', () => ({
  isOnline: () => mockOnline,
}));

const mockPushOps = jest.fn<(ops: { opId: string }[]) => Promise<PushResult[]>>();
jest.mock('@/shared/api/sync-api', () => ({
  pushOps: (ops: { opId: string }[]) => mockPushOps(ops),
  joinCityHub: jest.fn(),
  leaveLeague: jest.fn(),
}));

type Store = typeof import('@/shared/storage/local-store');
type Schedule = typeof import('@/shared/sync/schedule');
type Client = typeof import('@/shared/api/client');

function fresh(): { store: Store; schedule: Schedule; client: Client } {
  let mods: { store: Store; schedule: Schedule; client: Client } | undefined;
  jest.isolateModules(() => {
    mods = {
      store: require('@/shared/storage/local-store') as Store,
      schedule: require('@/shared/sync/schedule') as Schedule,
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

function op(id: string, over: Partial<PendingOp> = {}): PendingOp {
  return {
    opId: `op_${id}`,
    entity: 'player',
    docId: id,
    leagueId: 'lg1',
    action: 'upsert',
    payload: player({ id }),
    updatedAt: '2026-10-01T00:00:00.000Z',
    attempts: 0,
    uid: 'u1',
    ...over,
  };
}

function applied(ops: { opId: string }[]): PushResult[] {
  return ops.map((o, i) => ({ opId: o.opId, status: 'applied' as const, version: i + 1 }));
}

async function seed(store: Store, ops: PendingOp[]): Promise<void> {
  await store.loadStore();
  await store.updateStore((s) => ({ ...s, user, pendingOps: ops }));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPushOps.mockReset();
  mockOnline = true;
});

describe('flushPending', () => {
  it('splits a batch the server refused as a whole and still sends every write', async () => {
    const { store, schedule, client } = fresh();
    await seed(store, [op('a'), op('b'), op('c'), op('d')]);
    mockPushOps.mockImplementation(async (ops) => {
      if (ops.length > 1) {
        throw new client.ApiError(400, 'bad_request', 'Invalid request body.');
      }
      return applied(ops);
    });

    await schedule.flushPending({ force: true });

    expect(store.getStore().pendingOps).toEqual([]);
    const sentAlone = mockPushOps.mock.calls
      .map(([ops]) => ops)
      .filter((ops) => ops.length === 1)
      .map((ops) => ops[0]!.opId);
    expect(sentAlone.sort()).toEqual(['op_a', 'op_b', 'op_c', 'op_d']);
  });

  it('sets a refused write aside instead of deleting it, and stops sending it', async () => {
    const { store, schedule } = fresh();
    await seed(store, [op('a')]);
    mockPushOps.mockResolvedValue([
      { opId: 'op_a', status: 'rejected', code: 'forbidden', message: 'Someone else is scoring.' },
    ]);

    await schedule.flushPending({ force: true });
    await schedule.flushPending({ force: true });

    const [kept] = store.getStore().pendingOps;
    expect(kept?.opId).toBe('op_a');
    expect(kept?.parked).toMatchObject({
      reason: 'rejected',
      code: 'forbidden',
      message: 'Someone else is scoring.',
    });
    expect(mockPushOps).toHaveBeenCalledTimes(1);
  });

  it('sets a write aside after repeated conflicts instead of dropping it', async () => {
    const { store, schedule } = fresh();
    const mine = player({ id: 'a', displayName: 'Mine', updatedAt: '2026-10-31T00:00:00.000Z' });
    await seed(store, [op('a', { payload: mine, attempts: 4 })]);
    const current: ServerDoc = {
      entity: 'player',
      id: 'a',
      leagueId: 'lg1',
      version: 9,
      deleted: false,
      data: player({ id: 'a', displayName: 'Theirs' }) as unknown as Record<string, unknown>,
      updatedAt: '2026-10-02T00:00:00.000Z',
    };
    mockPushOps.mockResolvedValue([{ opId: 'op_a', status: 'conflict', current }]);

    await schedule.flushPending({ force: true });

    const [kept] = store.getStore().pendingOps;
    expect(kept?.parked?.reason).toBe('conflict');
  });

  it('keeps a write through a network failure without counting it, then waits', async () => {
    const { store, schedule, client } = fresh();
    await seed(store, [op('a')]);
    mockPushOps.mockRejectedValue(new client.NetworkError('Network request failed'));

    await schedule.flushPending({ force: true });
    const [kept] = store.getStore().pendingOps;
    expect(kept).toMatchObject({ opId: 'op_a', attempts: 0 });
    expect(kept?.failures).toBeUndefined();
    expect(kept?.parked).toBeUndefined();

    // Backing off: an automatic try right away sends nothing...
    await schedule.flushPending();
    expect(mockPushOps).toHaveBeenCalledTimes(1);
    // ...but a reconnect or the user's Retry does.
    mockPushOps.mockImplementation(async (ops) => applied(ops));
    await schedule.flushPending({ force: true });
    expect(store.getStore().pendingOps).toEqual([]);
  });

  it('sends smaller batches after a batch timed out', async () => {
    const { store, schedule, client } = fresh();
    await seed(store, [op('a'), op('b'), op('c'), op('d')]);
    mockPushOps.mockRejectedValueOnce(new client.NetworkError('Request timed out'));
    mockPushOps.mockImplementation(async (ops) => applied(ops));

    await schedule.flushPending({ force: true });
    await schedule.flushPending({ force: true });

    expect(mockPushOps.mock.calls.map(([ops]) => ops.length)).toEqual([4, 2, 2]);
    expect(store.getStore().pendingOps).toEqual([]);
  });

  it('sets a write aside after five server errors so it stops blocking the queue', async () => {
    const { store, schedule, client } = fresh();
    await seed(store, [op('a')]);
    mockPushOps.mockRejectedValue(new client.ApiError(500, 'internal', 'Something went wrong.'));

    for (let i = 0; i < 4; i += 1) {
      await schedule.flushPending({ force: true });
    }
    expect(store.getStore().pendingOps[0]).toMatchObject({ failures: 4 });
    expect(store.getStore().pendingOps[0]?.parked).toBeUndefined();

    await schedule.flushPending({ force: true });
    expect(store.getStore().pendingOps[0]?.parked?.reason).toBe('failing');
  });

  it('waits out a server that is restarting without ever setting the write aside', async () => {
    const { store, schedule, client } = fresh();
    await seed(store, [op('a')]);
    mockPushOps.mockRejectedValue(new client.ApiError(502, 'http_error', 'Bad gateway'));

    for (let i = 0; i < 8; i += 1) {
      await schedule.flushPending({ force: true });
    }
    const [kept] = store.getStore().pendingOps;
    expect(kept?.parked).toBeUndefined();
    expect(kept?.failures).toBeUndefined();
  });

  it("never sends another account's writes", async () => {
    const { store, schedule } = fresh();
    await seed(store, [op('a', { uid: 'someone-else' })]);
    mockPushOps.mockImplementation(async (ops) => applied(ops));

    await schedule.flushPending({ force: true });

    expect(mockPushOps).not.toHaveBeenCalled();
    expect(store.getStore().pendingOps.map((o) => o.opId)).toEqual(['op_a']);
  });

  it('keeps each batch under the size limit', async () => {
    const { store, schedule } = fresh();
    const big = (id: string) =>
      op(id, { payload: player({ id, displayName: 'x'.repeat(250_000) }) });
    await seed(store, [big('a'), big('b'), big('c')]);
    mockPushOps.mockImplementation(async (ops) => applied(ops));

    await schedule.flushPending({ force: true });

    expect(mockPushOps.mock.calls.map(([ops]) => ops.length)).toEqual([2, 1]);
    expect(store.getStore().pendingOps).toEqual([]);
  });
});

describe('queued writes and accounts', () => {
  it('records which account made a write', async () => {
    const { store, schedule } = fresh();
    await seed(store, []);
    mockOnline = false;

    await schedule.scheduleSync([
      { entity: 'player', docId: 'p1', leagueId: 'lg1', action: 'upsert', payload: player() },
    ]);

    expect(store.getStore().pendingOps[0]?.uid).toBe('u1');
  });

  it('gives untagged writes from older builds to the account signing out', () => {
    const { schedule } = fresh();
    const tagged = schedule.tagQueuedWrites(
      [op('a', { uid: undefined }), op('b', { uid: 'u2' })],
      'u1',
    );
    expect(tagged.map((o) => o.uid)).toEqual(['u1', 'u2']);
  });
});
