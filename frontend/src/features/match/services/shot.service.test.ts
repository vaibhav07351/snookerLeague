import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Player, SessionUser } from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/shared/sync', () => ({ scheduleSync: async () => undefined }));

type Store = typeof import('@/shared/storage/local-store');
type Shots = typeof import('@/features/match/services/shot.service');
type Matches = typeof import('@/features/match/services/match.service');
type NewMatch = typeof import('@/features/match/hooks/use-new-match');

interface Mods {
  store: Store;
  shots: Shots;
  matches: Matches;
}

function fresh(): Mods {
  let mods: Mods | undefined;
  jest.isolateModules(() => {
    mods = {
      store: require('@/shared/storage/local-store') as Store,
      shots: require('@/features/match/services/shot.service') as Shots,
      matches: require('@/features/match/services/match.service') as Matches,
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
  isDemo: true,
  cityId: null,
  cityName: null,
};

function player(id: string, name: string): Player {
  return {
    id,
    leagueId: 'lg1',
    displayName: name,
    kind: 'guest',
    authUid: null,
    photoUrl: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

async function singles(m: Mods, a = 'a1', b = 'b1', title = false) {
  await m.store.loadStore();
  await m.store.updateStore((s) => ({ ...s, user }));
  return m.matches.createMatch({
    leagueId: 'lg1',
    createdByUid: 'u1',
    format: 'singles',
    teamA: [a],
    teamB: [b],
    bestOf: 5,
    namedLabel: title ? 'Final' : null,
    crownsChampion: title,
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('putting a player back at the table after a foul', () => {
  it('survives undoing the next shot', async () => {
    const m = fresh();
    const match = await singles(m);
    await m.shots.recordShot(match.id, { kind: 'foul', points: 4 }); // A fouls: B to play
    await m.shots.setAtTablePlayer(match.id, 'a1'); // B puts A back in
    await m.shots.recordShot(match.id, { kind: 'pot', ball: 1 });

    const undone = await m.shots.undoLastShot(match.id);

    expect(undone.openFrame?.atTable).toBe('a');
    expect(undone.openFrame?.atTablePlayerId).toBe('a1');
    expect(undone.openFrame?.teamBPoints).toBe(4);
  });
});

describe('correcting the reds on the table', () => {
  it('takes reds off and puts them back, within what is really there', async () => {
    const m = fresh();
    const match = await singles(m);

    const off = await m.shots.adjustRedsOnTable(match.id, -1);
    expect(off.openFrame?.redsRemoved).toBe(1); // 14 reds left
    const back = await m.shots.adjustRedsOnTable(match.id, 1);
    expect(back.openFrame?.redsRemoved).toBe(0); // 15 again
    await expect(m.shots.adjustRedsOnTable(match.id, 1)).rejects.toThrow('No reds to put back');
  });
});

describe('rematch', () => {
  it('starts the same sides again, never as a title match', async () => {
    const m = fresh();
    const first = await singles(m, 'a1', 'b1', true);

    const again = await m.matches.createRematch(first.id, 'u1');

    expect(again.id).not.toBe(first.id);
    expect(again.teamA).toEqual(['a1']);
    expect(again.teamB).toEqual(['b1']);
    expect(again.bestOf).toBe(5);
    expect(again.crownsChampion).toBe(false);
    expect(again.namedLabel).toBeNull();
    expect(again.outcome.status).toBe('in_progress');
  });
});

describe('new match: who comes first in the picker', () => {
  it('lists the people you played most recently first', async () => {
    const m = fresh();
    await singles(m, 'me', 'old');
    await new Promise((r) => setTimeout(r, 5)); // a later createdAt
    await singles(m, 'me', 'recent');

    expect(await m.matches.recentCoPlayerIds('lg1', 'me')).toEqual(['recent', 'old']);
  });

  it('orders you, then recent opponents, then everyone else by name', () => {
    let mod: NewMatch | undefined;
    jest.isolateModules(() => {
      mod = require('@/features/match/hooks/use-new-match') as NewMatch;
    });
    const roster = [
      player('p1', 'Amit'),
      player('p2', 'Bina'),
      player('me', 'Chetan'),
      player('p3', 'Dev'),
    ];
    const ordered = mod!.orderForPicking(roster, 'me', ['p3', 'p2']);
    expect(ordered.map((p) => p.id)).toEqual(['me', 'p3', 'p2', 'p1']);
  });
});
