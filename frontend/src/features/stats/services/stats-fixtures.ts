/** Test builders for stats services. Only imported by *.test.ts files. */
import type { Match, Player, Race, RacePlace } from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

let seq = 0;

function stamp(day: number): string {
  return new Date(Date.UTC(2026, 0, 1) + day * 24 * 60 * 60 * 1000).toISOString();
}

export function player(id: string, name = id): Player {
  return {
    id,
    leagueId: 'l1',
    displayName: name,
    kind: 'guest',
    authUid: null,
    photoUrl: null,
    createdAt: stamp(0),
    updatedAt: stamp(0),
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

/** A finished match on `day`; side A wins unless `winner` says otherwise. */
export function match(
  teamA: string[],
  teamB: string[],
  opts: {
    day?: number;
    winner?: 'a' | 'b';
    frames?: [number, number];
    forfeitedBy?: 'a' | 'b';
  } = {},
): Match {
  seq += 1;
  const winner = opts.winner ?? 'a';
  const [framesA, framesB] = opts.frames ?? (winner === 'a' ? [2, 0] : [0, 2]);
  const at = stamp(opts.day ?? seq);
  return {
    id: `m${seq}`,
    leagueId: 'l1',
    createdAt: at,
    updatedAt: at,
    createdByUid: 'u1',
    teamA,
    teamB,
    bestOf: 3,
    namedLabel: null,
    crownsChampion: false,
    frames: [],
    outcome: opts.forfeitedBy
      ? {
          status: 'forfeited',
          winner,
          forfeitedBy: opts.forfeitedBy,
          framesA,
          framesB,
          scoreAtForfeit: { framesA, framesB, framePointsA: 0, framePointsB: 0 },
        }
      : { status: 'completed', winner, framesA, framesB },
  };
}

/** A finished race; `places` maps player id to finishing place. */
export function race(places: Record<string, RacePlace | null>, day?: number): Race {
  seq += 1;
  const at = stamp(day ?? seq);
  return {
    id: `r${seq}`,
    leagueId: 'l1',
    createdAt: at,
    updatedAt: at,
    createdByUid: 'u1',
    targetScore: 50,
    namedLabel: null,
    crownsRaceChampion: false,
    entrants: Object.entries(places).map(([playerId, place]) => ({
      playerId,
      score: 0,
      place,
      finishedAt: at,
    })),
    status: 'completed',
  };
}

export function dayIso(day: number): string {
  return stamp(day);
}
