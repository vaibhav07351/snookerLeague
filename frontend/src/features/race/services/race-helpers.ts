import type { Race, RaceEntrant, RaceLiveShot } from '@/shared/types/domain';

export function foulPointsOf(entrant: RaceEntrant): number {
  return entrant.foulPoints ?? 0;
}

export function netRaceScore(entrant: RaceEntrant): number {
  return entrant.score - foulPointsOf(entrant);
}

export function activePlayerIds(entrants: RaceEntrant[]): string[] {
  return entrants.filter((e) => e.place === null).map((e) => e.playerId);
}

export function nextActivePlayerId(entrants: RaceEntrant[], fromId: string): string | null {
  const active = activePlayerIds(entrants);
  if (active.length === 0) {
    return null;
  }
  const idx = active.indexOf(fromId);
  const from = idx === -1 ? 0 : idx;
  return active[(from + 1) % active.length] ?? null;
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
