import { nextInTurn, resolveTurnOrder } from '@/shared/utils/turn-order';
import type { Race, RaceEntrant, RaceLiveShot } from '@/shared/types/domain';

export function foulPointsOf(entrant: RaceEntrant): number {
  return entrant.foulPoints ?? 0;
}

/**
 * The live race score: points potted minus foul points. It can go below zero. A player
 * finishes when this reaches the target.
 */
export function netRaceScore(entrant: RaceEntrant): number {
  return entrant.score - foulPointsOf(entrant);
}

/** Whether an unplaced entrant has reached the target with their live score. */
export function hasReachedTarget(entrant: RaceEntrant, targetScore: number): boolean {
  return entrant.place === null && netRaceScore(entrant) >= targetScore;
}

/**
 * Order for players still playing: higher live score, then fewer fouls, then more potted.
 * Returns 0 only when two players are level on all three.
 */
export function compareUnfinished(a: RaceEntrant, b: RaceEntrant): number {
  return (
    netRaceScore(b) - netRaceScore(a) || foulPointsOf(a) - foulPointsOf(b) || b.score - a.score
  );
}

/**
 * Board order: finished players by place, then players still playing (see
 * `compareUnfinished`), then players who are out.
 */
export function compareRaceBoard(a: RaceEntrant, b: RaceEntrant): number {
  const rank = (e: RaceEntrant): number =>
    e.place === 'dnf' ? 2 : typeof e.place === 'number' ? 0 : 1;
  const byGroup = rank(a) - rank(b);
  if (byGroup !== 0) {
    return byGroup;
  }
  if (typeof a.place === 'number' && typeof b.place === 'number') {
    return a.place - b.place;
  }
  return a.place === null ? compareUnfinished(a, b) : 0;
}

export function activePlayerIds(entrants: RaceEntrant[]): string[] {
  return entrants.filter((e) => e.place === null).map((e) => e.playerId);
}

/** Playing order of a race: the saved order, or the entrant list for older races. */
export function raceTurnOrder(race: Pick<Race, 'entrants' | 'turnOrder'>): string[] {
  return resolveTurnOrder(
    race.turnOrder,
    race.entrants.map((e) => e.playerId),
  );
}

/** Next player still in the race after `fromId`, following the playing order. */
export function nextActivePlayerId(
  entrants: RaceEntrant[],
  fromId: string,
  turnOrder?: readonly string[],
): string | null {
  const order = turnOrder ?? entrants.map((e) => e.playerId);
  return nextInTurn(order, activePlayerIds(entrants), fromId);
}

export function withRaceDefaults(race: Race): Race {
  const firstActive = race.entrants.find((e) => e.place === null)?.playerId ?? null;
  const atTable =
    race.atTablePlayerId && race.entrants.some((e) => e.playerId === race.atTablePlayerId)
      ? race.atTablePlayerId
      : firstActive;
  return {
    ...race,
    liveShots: race.liveShots ?? [],
    atTablePlayerId: atTable,
    turnOrder: raceTurnOrder(race),
    entrants: race.entrants.map((e) => ({
      ...e,
      foulPoints: e.foulPoints ?? 0,
    })),
  };
}

export function currentRaceBreak(
  shots: RaceLiveShot[] | undefined,
  playerId: string | null,
): number {
  if (!playerId || !shots || shots.length === 0) {
    return 0;
  }
  let n = 0;
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    if (!shot || shot.kind !== 'pot' || shot.playerId !== playerId) {
      break;
    }
    n += shot.points;
  }
  return n;
}
