import { describe, expect, it, jest } from '@jest/globals';

import { buildHistory, idOf, NO_FILTER } from '@/features/history/services/history.service';
import { dayIso, match, race } from '@/features/stats/services/stats-fixtures';
import type { GroupMatch } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

function group(id: string, playerIds: string[], createdAt: string): GroupMatch {
  return {
    id,
    leagueId: 'l1',
    createdAt,
    updatedAt: createdAt,
    createdByUid: 'u1',
    playerIds,
    turnOrder: playerIds,
    bestOf: 3,
    namedLabel: null,
    frames: [],
    openFrame: null,
    status: 'completed',
    winnerId: playerIds[0] ?? null,
    finishedAt: createdAt,
  };
}

const singles = match(['a'], ['b'], { day: 1 });
const doubles = match(['a', 'c'], ['b', 'd'], { day: 2 });
const oneVsTwo = { ...match(['c'], ['b', 'd'], { day: 3 }), format: 'one_vs_two' as const };
const ffa = group('g1', ['a', 'b', 'c'], dayIso(4));
const raceGame = race({ c: 1, d: 2 }, 5);
const games = { matches: [singles, doubles, oneVsTwo], groups: [ffa], races: [raceGame] };

describe('buildHistory', () => {
  it('lists every game, newest start first', () => {
    const ids = buildHistory(games, NO_FILTER).map(idOf);
    expect(ids).toEqual([raceGame.id, 'g1', oneVsTwo.id, doubles.id, singles.id]);
  });

  it('narrows by format, telling singles, doubles and 1 vs 2 apart', () => {
    const only = (format: Parameters<typeof buildHistory>[1]['format']): string[] =>
      buildHistory(games, { format, playerId: null }).map(idOf);
    expect(only('singles')).toEqual([singles.id]);
    expect(only('doubles')).toEqual([doubles.id]);
    expect(only('one_vs_two')).toEqual([oneVsTwo.id]);
    expect(only('free_for_all')).toEqual(['g1']);
    expect(only('race')).toEqual([raceGame.id]);
  });

  it('keeps only games the chosen player was in, on any side', () => {
    expect(buildHistory(games, { format: 'all', playerId: 'd' }).map(idOf)).toEqual([
      raceGame.id,
      oneVsTwo.id,
      doubles.id,
    ]);
    expect(buildHistory(games, { format: 'doubles', playerId: 'a' }).map(idOf)).toEqual([
      doubles.id,
    ]);
    expect(buildHistory(games, { format: 'race', playerId: 'a' })).toEqual([]);
  });
});
