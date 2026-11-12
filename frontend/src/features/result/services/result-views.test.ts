import { describe, expect, it, jest } from '@jest/globals';

import { groupStandings } from '@/features/group/services/group-frame-engine';
import { groupResultView } from '@/features/group/services/group-result';
import { matchResultView } from '@/features/match/services/match-result';
import { raceResultView } from '@/features/race/services/race-result';
import { publicResultView } from '@/features/result/services/public-result.service';
import { resultShareUrl } from '@/features/result/services/share-result.service';
import { match, race } from '@/features/stats/services/stats-fixtures';
import type { GroupMatch } from '@/shared/types/domain';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

const names: Record<string, string> = { a: 'Rahul', b: 'Amit', c: 'Vik', d: 'Sam' };
const nameOf = (id: string): string => names[id] ?? 'Player';

describe('matchResultView', () => {
  it('is null while the match is live', () => {
    const live = {
      ...match(['a'], ['b']),
      outcome: { status: 'in_progress' as const, framesA: 1, framesB: 0 },
    };
    expect(matchResultView(live, { sideA: 'Rahul', sideB: 'Amit' })).toBeNull();
  });

  it('shows the frames score, the winning side and a title crown', () => {
    const m = {
      ...match(['a', 'c'], ['b', 'd'], { winner: 'b', frames: [1, 3] }),
      crownsChampion: true,
    };
    const view = matchResultView(m, { sideA: 'Rahul & Vik', sideB: 'Amit & Sam' });
    expect(view).toMatchObject({
      kind: 'match',
      mood: 'crown',
      score: '1-3',
      winnerLabel: 'Amit & Sam',
      winnerHeading: 'Winners',
      notes: ['New reigning champions'],
      summary: 'Rahul & Vik 1 - 3 Amit & Sam',
    });
    expect(view?.sides?.winner).toBe('b');
  });

  it('marks a forfeit', () => {
    const view = matchResultView(match(['a'], ['b'], { forfeitedBy: 'b' }), {
      sideA: 'Rahul',
      sideB: 'Amit',
    });
    expect(view?.mood).toBe('forfeit');
    expect(view?.winnerHeading).toBe('Winner');
  });
});

describe('raceResultView', () => {
  it('puts the winner first and drop-outs last', () => {
    const r = race({ a: 2, b: 'dnf', c: 1 });
    r.entrants = r.entrants.map((e) => ({ ...e, score: e.playerId === 'c' ? 52 : 30 }));
    const view = raceResultView(r, nameOf);
    expect(view?.standings.map((s) => `${s.place} ${s.name}`)).toEqual([
      '1 Vik',
      '2 Rahul',
      'Out Amit',
    ]);
    expect(view).toMatchObject({ winnerLabel: 'Vik', score: '52', scoreUnit: 'points' });
  });

  it('is null while the race is live', () => {
    expect(raceResultView({ ...race({ a: null }), status: 'in_progress' }, nameOf)).toBeNull();
  });
});

describe('groupResultView', () => {
  it('leads with the winner even when a tie-break decided it', () => {
    const g: GroupMatch = {
      id: 'g1',
      leagueId: 'l1',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:30:00.000Z',
      createdByUid: 'u1',
      playerIds: ['a', 'b', 'c'],
      turnOrder: ['a', 'b', 'c'],
      bestOf: 2,
      namedLabel: null,
      frames: [
        { points: { a: 40, b: 30, c: 5 }, winnerId: 'a', breakerId: 'a' },
        { points: { a: 10, b: 60, c: 5 }, winnerId: 'b', breakerId: 'b' },
      ],
      openFrame: null,
      status: 'completed',
      winnerId: 'b',
      finishedAt: '2026-11-01T10:30:00.000Z',
    };
    const view = groupResultView(g, groupStandings(g.frames, g.playerIds), nameOf);
    expect(view?.standings[0]).toMatchObject({ name: 'Amit', winner: true });
    expect(view?.standings[0]?.detail).toBe('1 frame · 90 pts');
    expect(view).toMatchObject({ score: '1', scoreUnit: 'frame', winnerLabel: 'Amit' });
  });
});

describe('public results', () => {
  it('turns a public race into the same card, the winner leading', () => {
    const view = publicResultView({
      kind: 'race',
      id: 'r1',
      label: 'Snooker race',
      caption: 'Race to 50',
      league: 'Cue Club',
      when: '12 Nov 2026',
      live: false,
      status: '',
      framesA: 0,
      framesB: 0,
      standings: [
        { place: '1', name: 'Rahul S.', detail: '50 pts', winner: true },
        { place: '2', name: 'Player', detail: '30 pts', winner: false },
      ],
    });
    expect(view).toMatchObject({
      kind: 'race',
      winnerLabel: 'Rahul S.',
      score: '50 pts',
      notes: ['Cue Club · 12 Nov 2026'],
    });
  });

  it('links each kind to its own public page', () => {
    expect(resultShareUrl('match', 'm 1')).toMatch(/\/m\/m%201$/);
    expect(resultShareUrl('race', 'r1')).toMatch(/\/r\/r1$/);
    expect(resultShareUrl('group', 'g1')).toMatch(/\/g\/g1$/);
  });
});
