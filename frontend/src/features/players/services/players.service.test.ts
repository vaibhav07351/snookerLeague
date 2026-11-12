import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { League, Player } from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({ scheduleSync: async () => undefined }));

type Players = typeof import('@/features/players/services/players.service');
type Store = typeof import('@/shared/storage/local-store');

function fresh(): { players: Players; store: Store } {
  let mods: { players: Players; store: Store } | undefined;
  jest.isolateModules(() => {
    mods = {
      players: require('@/features/players/services/players.service') as Players,
      store: require('@/shared/storage/local-store') as Store,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

function league(id: string, kind: League['kind']): League {
  return {
    id,
    name: id,
    inviteCode: 'ABC234',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    createdByUid: 'owner',
    memberUids: ['owner', 'u1'],
    defaultRaceTarget: 50,
    defaultBestOf: 3,
    reigningTeam: null,
    raceKing: null,
    kind,
    cityId: kind === 'city' ? 'pune' : null,
  };
}

function guest(id: string, leagueId: string): Player {
  return {
    id,
    leagueId,
    displayName: 'Rahul',
    kind: 'guest',
    authUid: null,
    photoUrl: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("claimPlayer ('That's me')", () => {
  it('claims a guest card in a club league', async () => {
    const { players, store } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({
      ...s,
      leagues: [league('club', 'club')],
      players: [guest('g1', 'club')],
    }));

    const claimed = await players.claimPlayer({ playerId: 'g1', uid: 'u1', photoUrl: null });

    expect(claimed.authUid).toBe('u1');
  });

  it('asks for a claim link in a city hub instead', async () => {
    const { players, store } = fresh();
    await store.loadStore();
    await store.updateStore((s) => ({
      ...s,
      leagues: [league('city_pune', 'city')],
      players: [guest('g1', 'city_pune')],
    }));

    await expect(
      players.claimPlayer({ playerId: 'g1', uid: 'u1', photoUrl: null }),
    ).rejects.toThrow('claim link');
    expect(store.getStore().players[0]!.authUid).toBeNull();
  });
});
