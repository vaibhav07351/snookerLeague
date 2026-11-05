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

describe('race scoring after fouls', () => {
  async function twoPlayerRace(target: number) {
    const { race, live, store } = fresh();
    await store.loadStore();
    const created = await race.createRace({
      leagueId: 'lg1',
      createdByUid: 'u1',
      playerIds: ['ravi', 'amit'],
      targetScore: target,
      namedLabel: null,
      crownsRaceChampion: false,
    });
    return { race, live, id: created.id };
  }

  it('lets the live score go below zero', async () => {
    const { live, id } = await twoPlayerRace(10);
    const r = await live.recordFoul(id, 4);
    const ravi = r.entrants.find((e) => e.playerId === 'ravi')!;
    expect(ravi.score - (ravi.foulPoints ?? 0)).toBe(-4);
  });

  it('finishes only when the score after fouls reaches the target', async () => {
    const { live, id } = await twoPlayerRace(10);
    await live.recordFoul(id, 4); // Ravi -4, Amit to play
    await live.recordMiss(id); // back to Ravi
    let r = await live.recordPot(id, 7);
    r = await live.recordPot(id, 7); // potted 14, live 10
    expect(r.entrants.find((e) => e.playerId === 'ravi')?.place).toBe(1);
    // Potted points are kept as they are, never bumped to the target.
    expect(r.entrants.find((e) => e.playerId === 'ravi')?.score).toBe(14);
  });

  it('does not finish a player whose potted points reach the target but fouls pull them back', async () => {
    const { live, id } = await twoPlayerRace(10);
    await live.recordFoul(id, 4);
    await live.recordMiss(id);
    const r = await live.recordPot(id, 7);
    await live.recordPot(id, 5);
    const after = await live.recordPot(id, 1); // potted 13, live 9
    expect(r.entrants.find((e) => e.playerId === 'ravi')?.place).toBeNull();
    expect(after.entrants.find((e) => e.playerId === 'ravi')?.place).toBeNull();
  });

  it('reopens a finished player when undo takes them back under the target', async () => {
    const { live, id } = await twoPlayerRace(7);
    await live.recordPot(id, 7);
    const r = await live.undoLast(id);
    expect(r.entrants.find((e) => e.playerId === 'ravi')?.place).toBeNull();
  });
});

describe('placesForUnfinished', () => {
  const entrant = (playerId: string, score: number, foulPoints: number) => ({
    playerId,
    score,
    foulPoints,
    place: null,
    finishedAt: null,
  });

  it('orders by live score, then fewer fouls, and shares a place when fully level', () => {
    const { race } = fresh();
    const places = race.placesForUnfinished([
      { ...entrant('done', 60, 0), place: 1 },
      entrant('a', 30, 10), // live 20, 10 fouls
      entrant('b', 24, 4), // live 20, 4 fouls: ahead of a
      entrant('c', 24, 4), // level with b on everything
      entrant('d', 5, 0),
    ]);
    expect(Object.fromEntries(places)).toEqual({ b: 2, c: 2, a: 4, d: 5 });
  });
});
