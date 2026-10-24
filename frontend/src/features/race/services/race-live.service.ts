import { z } from 'zod';

import { nextActivePlayerId, withRaceDefaults } from '@/features/race/services/race-helpers';
import { nextPlace, persistRace } from '@/features/race/services/race.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { createId, nowIso } from '@/shared/utils/id';
import type { BallValue, Race, RaceEntrant, RaceLiveShot } from '@/shared/types/domain';

const ballSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const foulSchema = z.number().int().min(4).max(7);

async function requireLiveRace(raceId: string): Promise<Race> {
  await loadStore();
  const found = getStore().races.find((r) => r.id === raceId);
  if (!found) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (found.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished');
  }
  return withRaceDefaults(found);
}

function atTableId(race: Race): string {
  const active = race.entrants.filter((e) => e.place === null).map((e) => e.playerId);
  const seated =
    race.atTablePlayerId && active.includes(race.atTablePlayerId)
      ? race.atTablePlayerId
      : active[0];
  if (!seated) {
    throw new AppError('INVALID_STATE', 'No players left to score');
  }
  return seated;
}

function applyTarget(
  entrants: RaceEntrant[],
  playerId: string,
  targetScore: number,
): RaceEntrant[] {
  const hit = entrants.find(
    (e) => e.playerId === playerId && e.place === null && e.score >= targetScore,
  );
  if (!hit) {
    return entrants;
  }
  const place = nextPlace(entrants);
  return entrants.map((e) =>
    e.playerId === playerId
      ? { ...e, place, finishedAt: nowIso(), score: Math.max(e.score, targetScore) }
      : e,
  );
}

function mapEntrant(
  entrants: RaceEntrant[],
  playerId: string,
  update: (e: RaceEntrant) => RaceEntrant,
): RaceEntrant[] {
  return entrants.map((e) => (e.playerId === playerId ? update(e) : e));
}

async function appendShot(
  race: Race,
  shot: RaceLiveShot,
  atTablePlayerId: string | null,
): Promise<Race> {
  const updated: Race = {
    ...race,
    liveShots: [...(race.liveShots ?? []), shot],
    atTablePlayerId,
    updatedAt: nowIso(),
  };
  await persistRace(updated);
  logger.info('race-live.service', 'Shot recorded', { raceId: race.id, kind: shot.kind });
  return updated;
}

export async function setAtTablePlayer(raceId: string, playerId: string): Promise<Race> {
  const race = await requireLiveRace(raceId);
  const target = race.entrants.find((e) => e.playerId === playerId);
  if (!target || target.place !== null) {
    throw new AppError('INVALID_STATE', 'That player is not at the table');
  }
  const updated: Race = { ...race, atTablePlayerId: playerId, updatedAt: nowIso() };
  await persistRace(updated);
  return updated;
}

export async function recordPot(raceId: string, ball: BallValue): Promise<Race> {
  const parsed = ballSchema.safeParse(ball);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid pot');
  }
  const race = await requireLiveRace(raceId);
  const playerId = atTableId(race);
  let entrants = mapEntrant(race.entrants, playerId, (e) => ({
    ...e,
    score: e.score + parsed.data,
  }));
  entrants = applyTarget(entrants, playerId, race.targetScore);
  const stillIn = entrants.find((e) => e.playerId === playerId)?.place === null;
  const nextId = stillIn ? playerId : nextActivePlayerId(entrants, playerId);
  const shot: RaceLiveShot = {
    id: createId('rs'),
    at: nowIso(),
    playerId,
    kind: 'pot',
    points: parsed.data,
    ball: parsed.data,
  };
  return appendShot({ ...race, entrants }, shot, nextId);
}

export async function recordFoul(raceId: string, points: number): Promise<Race> {
  const parsed = foulSchema.safeParse(points);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Foul must be 4–7 points');
  }
  const race = await requireLiveRace(raceId);
  const playerId = atTableId(race);
  const entrants = mapEntrant(race.entrants, playerId, (e) => ({
    ...e,
    foulPoints: (e.foulPoints ?? 0) + parsed.data,
  }));
  const shot: RaceLiveShot = {
    id: createId('rs'),
    at: nowIso(),
    playerId,
    kind: 'foul',
    points: parsed.data,
  };
  return appendShot({ ...race, entrants }, shot, nextActivePlayerId(entrants, playerId));
}

export async function recordMiss(raceId: string): Promise<Race> {
  const race = await requireLiveRace(raceId);
  const playerId = atTableId(race);
  const shot: RaceLiveShot = {
    id: createId('rs'),
    at: nowIso(),
    playerId,
    kind: 'miss',
    points: 0,
  };
  return appendShot(race, shot, nextActivePlayerId(race.entrants, playerId));
}

export async function undoLast(raceId: string): Promise<Race> {
  const race = await requireLiveRace(raceId);
  const shots = race.liveShots ?? [];
  const last = shots[shots.length - 1];
  if (!last) {
    throw new AppError('INVALID_STATE', 'No shot to undo');
  }

  let entrants = race.entrants;
  if (last.kind === 'pot') {
    entrants = mapEntrant(entrants, last.playerId, (e) => {
      const score = Math.max(0, e.score - last.points);
      const placed = typeof e.place === 'number';
      const reopen = placed && score < race.targetScore;
      return {
        ...e,
        score,
        place: reopen ? null : e.place,
        finishedAt: reopen ? null : e.finishedAt,
      };
    });
  } else if (last.kind === 'foul') {
    entrants = mapEntrant(entrants, last.playerId, (e) => ({
      ...e,
      foulPoints: Math.max(0, (e.foulPoints ?? 0) - last.points),
    }));
  }

  const updated: Race = {
    ...race,
    entrants,
    liveShots: shots.slice(0, -1),
    atTablePlayerId: last.playerId,
    updatedAt: nowIso(),
  };
  await persistRace(updated);
  logger.info('race-live.service', 'Shot undone', { raceId, kind: last.kind });
  return updated;
}
