import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PullPage, ServerDoc } from '@/shared/api/sync-api';

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

const mockPullPage = jest.fn<(since: number, leagueId?: string) => Promise<PullPage>>();
jest.mock('@/shared/api/sync-api', () => ({
  pullPage: (since: number, leagueId?: string) => mockPullPage(since, leagueId),
  fetchInvite: jest.fn(),
  pushOps: jest.fn(),
}));

type Store = typeof import('@/shared/storage/local-store');
type Pull = typeof import('@/shared/sync/pull');

function fresh(): { store: Store; pull: Pull } {
  let mods: { store: Store; pull: Pull } | undefined;
  jest.isolateModules(() => {
    mods = {
      store: require('@/shared/storage/local-store') as Store,
      pull: require('@/shared/sync/pull') as Pull,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

function eventDoc(id: string, version: number): ServerDoc {
  return {
    entity: 'event',
    id,
    leagueId: 'lg1',
    version,
    deleted: false,
    data: {
      type: 'match_won',
      createdAt: '2026-10-01T00:00:00.000Z',
      title: id,
      body: '',
      relatedIds: [],
    },
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockPullPage.mockReset();
});

describe('pullChanges', () => {
  it('follows pages from the saved cursor and stores where it stopped', async () => {
    const { store, pull } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, syncCursor: 10, pullKindsVersion: 99 }));
    mockPullPage
      .mockResolvedValueOnce({ docs: [eventDoc('e1', 11)], cursor: 11, hasMore: true })
      .mockResolvedValueOnce({ docs: [eventDoc('e2', 12)], cursor: 12, hasMore: false });

    await pull.pullChanges();

    expect(mockPullPage.mock.calls.map(([since]) => since)).toEqual([10, 11]);
    expect(store.getStore().syncCursor).toBe(12);
    expect(
      store
        .getStore()
        .events.map((e) => e.id)
        .sort(),
    ).toEqual(['e1', 'e2']);
  });

  it('starts again from 0 once when the app learned a new document kind', async () => {
    const { store, pull } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, syncCursor: 50, pullKindsVersion: 0 }));
    mockPullPage.mockResolvedValue({ docs: [], cursor: 0, hasMore: false });

    await pull.pullChanges();

    expect(mockPullPage).toHaveBeenCalledWith(0, undefined);
    expect(store.getStore().pullKindsVersion).toBeGreaterThan(0);
  });

  it('never moves the cursor backwards', async () => {
    const { store, pull } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, syncCursor: 30, pullKindsVersion: 99 }));
    mockPullPage.mockResolvedValue({ docs: [], cursor: 20, hasMore: false });

    await pull.pullChanges();

    expect(store.getStore().syncCursor).toBe(30);
  });
});

describe('fetchLeagueHistory', () => {
  it('returns the whole history or throws, never part of it', async () => {
    const { pull } = fresh();
    mockPullPage
      .mockResolvedValueOnce({ docs: [eventDoc('e1', 1)], cursor: 1, hasMore: true })
      .mockResolvedValueOnce({ docs: [eventDoc('e2', 2)], cursor: 2, hasMore: false });
    await expect(pull.fetchLeagueHistory('lg1')).resolves.toHaveLength(2);

    mockPullPage.mockReset();
    mockPullPage.mockResolvedValue({ docs: [eventDoc('e', 1)], cursor: 1, hasMore: true });
    await expect(pull.fetchLeagueHistory('lg1')).rejects.toThrow('too long');
  });
});
