import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({ scheduleSync: async () => undefined }));

type GroupService = typeof import('@/features/group/services/group.service');
type GroupLive = typeof import('@/features/group/services/group-live.service');
type Engine = typeof import('@/features/group/services/group-frame-engine');
type Store = typeof import('@/shared/storage/local-store');

interface Mods {
  group: GroupService;
  live: GroupLive;
  engine: Engine;
  store: Store;
}

function fresh(): Mods {
  let mods: Mods | undefined;
  jest.isolateModules(() => {
    mods = {
      group: require('@/features/group/services/group.service') as GroupService,
      live: require('@/features/group/services/group-live.service') as GroupLive,
      engine: require('@/features/group/services/group-frame-engine') as Engine,
      store: require('@/shared/storage/local-store') as Store,
    };
  });
  if (!mods) {
    throw new Error('modules not loaded');
  }
  return mods;
}

async function start(m: Mods, bestOf = 3): Promise<string> {
  await m.store.loadStore();
  await m.store.updateStore((s) => ({
    ...s,
    user: { uid: 'u1', displayName: 'Ravi', email: null, photoUrl: null } as typeof s.user,
  }));
  const created = await m.group.createGroupMatch({
    leagueId: 'lg1',
    createdByUid: 'u1',
    playerIds: ['ravi', 'amit', 'sunil'],
    bestOf,
    namedLabel: null,
  });
  return created.id;
}

function pointsOf(m: Mods, id: string): Record<string, number> {
  const g = m.store.getStore().groupMatches.find((x) => x.id === id);
  if (!g?.openFrame) {
    throw new Error('no open frame');
  }
  return m.engine.replayGroupFrame(g.openFrame.shots, g.playerIds).points;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('free-for-all scoring', () => {
  it('rejects fewer than three players', async () => {
    const m = fresh();
    await m.store.loadStore();
    await expect(
      m.group.createGroupMatch({
        leagueId: 'lg1',
        createdByUid: 'u1',
        playerIds: ['a', 'b'],
        bestOf: 3,
        namedLabel: null,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('scores pots, passes the table on a miss and applies the foul rule', async () => {
    const m = fresh();
    const id = await start(m);

    await m.live.recordShot(id, { kind: 'pot', ball: 1 });
    await m.live.recordShot(id, { kind: 'pot', ball: 7 });
    let g = await m.live.recordShot(id, { kind: 'miss' });
    expect(g.openFrame?.atTablePlayerId).toBe('amit');

    await m.live.recordShot(id, { kind: 'pot', ball: 1 });
    // Amit has 1 and fouls 4: down to 0, Ravi and Sunil get the 3 he could not pay.
    g = await m.live.recordShot(id, { kind: 'foul', points: 4 });
    expect(pointsOf(m, id)).toEqual({ ravi: 11, amit: 0, sunil: 3 });
    expect(g.openFrame?.atTablePlayerId).toBe('sunil');
  });

  it('learns the playing order from a manual pick', async () => {
    const m = fresh();
    const id = await start(m);

    await m.live.recordShot(id, { kind: 'miss' }); // Ravi misses; the app offers Amit
    let g = await m.live.setAtTablePlayer(id, 'sunil');
    expect(g.turnOrder).toEqual(['ravi', 'sunil', 'amit']);
    g = await m.live.recordShot(id, { kind: 'miss' });
    expect(g.openFrame?.atTablePlayerId).toBe('amit');
  });

  it('only lets the top scorer win the frame, and passes the break on', async () => {
    const m = fresh();
    const id = await start(m);
    await m.live.recordShot(id, { kind: 'pot', ball: 1 });

    await expect(m.live.endFrame(id, 'amit')).rejects.toMatchObject({ code: 'VALIDATION' });
    const g = await m.live.endFrame(id, 'ravi');
    expect(g.frames).toHaveLength(1);
    expect(g.openFrame).toMatchObject({ breakerId: 'amit', atTablePlayerId: 'amit', shots: [] });
  });

  it('finishes once nobody can catch the leader, and undo reopens the last frame', async () => {
    const m = fresh();
    const id = await start(m, 3);
    for (let frame = 0; frame < 2; frame += 1) {
      await m.live.setAtTablePlayer(id, 'sunil');
      await m.live.recordShot(id, { kind: 'pot', ball: 1 });
      await m.live.endFrame(id, 'sunil');
    }
    let g = m.store.getStore().groupMatches.find((x) => x.id === id);
    expect(g).toMatchObject({ status: 'completed', winnerId: 'sunil', openFrame: null });
    expect(m.store.getStore().events.some((e) => e.type === 'group_won')).toBe(true);

    g = await m.live.undoLast(id);
    expect(g).toMatchObject({ status: 'in_progress', winnerId: null });
    expect(g.frames).toHaveLength(1);
    expect(g.openFrame?.shots).toHaveLength(1);
  });
});
