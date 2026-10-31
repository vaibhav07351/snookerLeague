import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppDataStore, Match } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type LocalStore = typeof import('@/shared/storage/local-store');

/** Fresh module per test: the store keeps its state in module scope. */
function freshStore(): LocalStore {
  let mod: LocalStore | undefined;
  jest.isolateModules(() => {
    mod = require('@/shared/storage/local-store') as LocalStore;
  });
  if (!mod) {
    throw new Error('module not loaded');
  }
  return mod;
}

function match(id: string, frames = 0): Match {
  return {
    id,
    leagueId: 'lg_1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdByUid: 'u1',
    teamA: ['p1'],
    teamB: ['p2'],
    bestOf: 3,
    namedLabel: null,
    crownsChampion: false,
    frames: Array.from({ length: frames }, () => ({
      teamAPoints: 50,
      teamBPoints: 10,
      winner: 'a' as const,
    })),
    outcome: { status: 'in_progress', framesA: 0, framesB: 0 },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('local store persistence', () => {
  it('starts blank and leaves data from the Firebase builds untouched', async () => {
    const old: Partial<AppDataStore> = { matches: [match('m1')], activeLeagueId: 'lg_1' };
    await AsyncStorage.setItem('snooker.v1.store', JSON.stringify(old));
    await AsyncStorage.setItem('snooker.v2.meta', JSON.stringify({ storeVersion: 2 }));

    const store = freshStore();
    const loaded = await store.loadStore();

    expect(loaded.matches).toHaveLength(0);
    expect(loaded.activeLeagueId).toBeNull();
    expect(store.isStoreReadOnly()).toBe(false);
    expect(await AsyncStorage.getItem('snooker.v1.store')).not.toBeNull();
    expect(await AsyncStorage.getItem('snooker.v2.meta')).not.toBeNull();
  });

  it('keeps sync bookkeeping across launches', async () => {
    const store = freshStore();
    await store.loadStore();
    await store.updateStore((s) => ({
      ...s,
      serverVersions: { 'match:m1': 7 },
      syncCursor: 7,
    }));

    const reloaded = await freshStore().loadStore();
    expect(reloaded.serverVersions).toEqual({ 'match:m1': 7 });
    expect(reloaded.syncCursor).toBe(7);
  });

  it('never saves over data it could not read', async () => {
    await AsyncStorage.setItem('snooker.v3.meta', '{not json');
    const store = freshStore();
    await store.loadStore();
    expect(store.isStoreReadOnly()).toBe(true);

    await store.updateStore((s) => ({ ...s, matches: [match('new')] }));

    expect(store.getStore().matches).toHaveLength(1); // still usable in memory
    expect(await AsyncStorage.getItem('snooker.v3.meta')).toBe('{not json');
  });

  it('writes only the match that changed', async () => {
    const store = freshStore();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, matches: [match('m1'), match('m2')] }));
    jest.mocked(AsyncStorage.multiSet).mockClear();

    await store.updateStore((s) => ({
      ...s,
      matches: s.matches.map((m) => (m.id === 'm2' ? match('m2', 1) : m)),
    }));

    const written = jest
      .mocked(AsyncStorage.multiSet)
      .mock.calls.flatMap(([pairs]) => pairs.map(([key]) => key));
    expect(written).toContain('snooker.v3.match.m2');
    expect(written).not.toContain('snooker.v3.match.m1');
  });

  it('removes the key of a deleted match', async () => {
    const store = freshStore();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, matches: [match('m1'), match('m2')] }));
    await store.updateStore((s) => ({ ...s, matches: s.matches.filter((m) => m.id !== 'm1') }));

    expect(await AsyncStorage.getItem('snooker.v3.match.m1')).toBeNull();
    const reloaded = await freshStore().loadStore();
    expect(reloaded.matches.map((m) => m.id)).toEqual(['m2']);
  });

  it('skips writing when a mutator returns equal data', async () => {
    const store = freshStore();
    await store.loadStore();
    await store.updateStore((s) => ({ ...s, matches: [match('m1')] }));
    jest.mocked(AsyncStorage.multiSet).mockClear();

    await store.updateStore((s) => ({ ...s, matches: [match('m1')] }));

    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
  });
});
