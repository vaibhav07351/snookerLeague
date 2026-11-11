import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyRaceStats, emptyStandardStats, type League } from '@/shared/types/domain';

interface SyncedItem {
  entity: string;
  docId: string;
  action: string;
  payload: unknown;
}

const mockSynced: SyncedItem[] = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({
  scheduleSync: async (items: SyncedItem[]) => {
    mockSynced.push(...items);
  },
}));

type RaceService = typeof import('@/features/race/services/race.service');
type RaceAdmin = typeof import('@/features/race/services/race-admin.service');
type RaceLive = typeof import('@/features/race/services/race-live.service');
type Store = typeof import('@/shared/storage/local-store');

interface Mods {
  race: RaceService;
  admin: RaceAdmin;
  live: RaceLive;
  store: Store;
}

function fresh(): Mods {
  let mods: Mods | undefined;
  jest.isolateModules(() => {
    mods = {
      race: require('@/features/race/services/race.service') as RaceService,
      admin: require('@/features/race/services/race-admin.service') as RaceAdmin,
      live: require('@/features/race/services/race-live.service') as RaceLive,
      store: require('@/shared/storage/local-store') as Store,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

const league: League = {
  id: 'lg1',
  name: 'Test',
  inviteCode: 'ABC123',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  createdByUid: 'owner',
  memberUids: ['owner', 'u1', 'u2'],
  defaultRaceTarget: 50,
  defaultBestOf: 3,
  reigningTeam: null,
  raceKing: null,
};

async function signedIn(m: Mods, uid: string): Promise<void> {
  await m.store.loadStore();
  await m.store.updateStore((s) => ({
    ...s,
    user: { uid, displayName: uid, email: null, photoUrl: null } as typeof s.user,
    leagues: s.leagues.some((l) => l.id === league.id) ? s.leagues : [...s.leagues, league],
  }));
}

/** A finished race created by `u1` that `winner` wins by potting a black to a target of 7. */
async function finishedRace(m: Mods, winner: 'ravi' | 'amit', crowns: boolean): Promise<string> {
  const created = await m.race.createRace({
    leagueId: 'lg1',
    createdByUid: 'u1',
    playerIds: winner === 'ravi' ? ['ravi', 'amit'] : ['amit', 'ravi'],
    targetScore: 7,
    namedLabel: null,
    crownsRaceChampion: crowns,
  });
  await m.live.recordPot(created.id, 1);
  await m.race.completeRace(created.id);
  return created.id;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSynced.length = 0;
});

describe('deleteRace', () => {
  it('lets the creator and the league owner delete, nobody else', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    const id = await finishedRace(m, 'ravi', false);
    const race = m.store.getStore().races.find((r) => r.id === id)!;
    expect(m.admin.canManageRace(race, 'u1')).toBe(true);
    expect(m.admin.canManageRace(race, 'owner')).toBe(true);
    expect(m.admin.canManageRace(race, 'u2')).toBe(false);
    expect(m.admin.canManageRace(race, null)).toBe(false);

    await signedIn(m, 'u2');
    await expect(m.admin.deleteRace(id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(m.store.getStore().races.some((r) => r.id === id)).toBe(true);
  });

  it('removes the race, recomputes stats, withdraws its post and syncs the delete', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    await m.store.updateStore((s) => ({
      ...s,
      players: ['ravi', 'amit'].map((pid) => ({
        id: pid,
        leagueId: 'lg1',
        displayName: pid,
        kind: 'guest' as const,
        authUid: null,
        photoUrl: null,
        createdAt: league.createdAt,
        updatedAt: league.createdAt,
        stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
      })),
    }));
    const id = await finishedRace(m, 'ravi', false);
    const raviBefore = m.store.getStore().players.find((p) => p.id === 'ravi');
    expect(raviBefore?.stats.race.firsts).toBe(1);
    expect(raviBefore?.stats.race.reds).toBe(1);
    mockSynced.length = 0;

    await m.admin.deleteRace(id);

    const s = m.store.getStore();
    expect(s.races.some((r) => r.id === id)).toBe(false);
    const ravi = s.players.find((p) => p.id === 'ravi');
    expect(ravi?.stats.race.firsts).toBe(0);
    expect(ravi?.stats.race.reds).toBe(0);
    const post = s.events.find((e) => e.relatedIds.includes(id));
    expect(post?.retracted).toBe(true);
    expect(mockSynced).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: 'race', docId: id, action: 'delete', payload: null }),
        expect.objectContaining({ entity: 'event', docId: post?.id, action: 'upsert' }),
      ]),
    );
    // A race that never crowned anyone leaves the league alone.
    expect(mockSynced.some((i) => i.entity === 'league')).toBe(false);
  });

  it('gives the crown back to the previous race king, or nobody', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    const first = await finishedRace(m, 'amit', true);
    const second = await finishedRace(m, 'ravi', true);
    const kingOf = (): string | null =>
      m.store.getStore().leagues.find((l) => l.id === 'lg1')?.raceKing?.playerId ?? null;
    expect(kingOf()).toBe('ravi');

    await m.admin.deleteRace(second);
    expect(kingOf()).toBe('amit');
    expect(mockSynced.some((i) => i.entity === 'league' && i.action === 'upsert')).toBe(true);

    await m.admin.deleteRace(first);
    expect(kingOf()).toBeNull();
  });

  it('leaves the race king alone when another race is deleted', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    const crowning = await finishedRace(m, 'amit', true);
    const other = await finishedRace(m, 'ravi', false);
    await m.admin.deleteRace(other);
    expect(m.store.getStore().leagues[0]?.raceKing?.raceId).toBe(crowning);
  });

  it('deletes a race still in progress', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    const created = await m.race.createRace({
      leagueId: 'lg1',
      createdByUid: 'u1',
      playerIds: ['ravi', 'amit'],
      targetScore: 50,
      namedLabel: null,
      crownsRaceChampion: false,
    });
    await m.admin.deleteRace(created.id);
    expect(m.store.getStore().races).toHaveLength(0);
  });

  it('reports a missing race', async () => {
    const m = fresh();
    await signedIn(m, 'u1');
    await expect(m.admin.deleteRace('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
