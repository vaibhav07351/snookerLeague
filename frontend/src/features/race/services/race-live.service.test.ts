import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({ scheduleSync: async () => undefined }));

type RaceService = typeof import('@/features/race/services/race.service');
type RaceLive = typeof import('@/features/race/services/race-live.service');
type Store = typeof import('@/shared/storage/local-store');

function fresh(): { race: RaceService; live: RaceLive; store: Store } {
  let mods: { race: RaceService; live: RaceLive; store: Store } | undefined;
  jest.isolateModules(() => {
    mods = {
      race: require('@/features/race/services/race.service') as RaceService,
      live: require('@/features/race/services/race-live.service') as RaceLive,
      store: require('@/shared/storage/local-store') as Store,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('race turn order', () => {
  it('learns the real order from a manual pick and keeps following it', async () => {
    const { race, live, store } = fresh();
    await store.loadStore();
    // Listed Ravi, Amit, Sunil, Deepak; at the table they play Ravi, Sunil, Amit, Deepak.
    const created = await race.createRace({
      leagueId: 'lg1',
      createdByUid: 'u1',
      playerIds: ['ravi', 'amit', 'sunil', 'deepak'],
      targetScore: 50,
      namedLabel: null,
      crownsRaceChampion: false,
    });

    let r = await live.recordMiss(created.id);
    expect(r.atTablePlayerId).toBe('amit');

    r = await live.setAtTablePlayer(created.id, 'sunil');
    expect(r.turnOrder).toEqual(['ravi', 'sunil', 'amit', 'deepak']);

    r = await live.recordMiss(created.id);
    expect(r.atTablePlayerId).toBe('amit');
    r = await live.recordFoul(created.id, 4);
    expect(r.atTablePlayerId).toBe('deepak');
    r = await live.recordMiss(created.id);
    expect(r.atTablePlayerId).toBe('ravi');
  });

  it('keeps list order for races saved before turn order existed', async () => {
    const { race, live, store } = fresh();
    await store.loadStore();
    const created = await race.createRace({
      leagueId: 'lg1',
      createdByUid: 'u1',
      playerIds: ['a', 'b', 'c'],
      targetScore: 50,
      namedLabel: null,
      crownsRaceChampion: false,
    });
    await store.updateStore((s) => ({
      ...s,
      races: s.races.map(({ turnOrder: _drop, ...rest }) => rest),
    }));

    const r = await live.recordMiss(created.id);
    expect(r.atTablePlayerId).toBe('b');
  });
});
