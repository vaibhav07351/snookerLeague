import { z } from 'zod';

import {
  activePlayerIds,
  hasReachedTarget,
  netRaceScore,
  nextActivePlayerId,
  racePotPoints,
  raceTurnOrder,
  RACE_FOUL_POINTS,
  withRaceDefaults,
} from '@/features/race/services/race-helpers';
import { nextPlace, persistRace, serializeRaceWrite } from '@/features/race/services/race.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { createId, nowIso } from '@/shared/utils/id';
import { movePlayerAfter } from '@/shared/utils/turn-order';
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

const foulSchema = z.union([z.literal(RACE_FOUL_POINTS[0]), z.literal(RACE_FOUL_POINTS[1])]);

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
  const active = activePlayerIds(race.entrants);
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
  const hit = entrants.find((e) => e.playerId === playerId && hasReachedTarget(e, targetScore));
  if (!hit) {
    return entrants;
  }
  const place = nextPlace(entrants);
  return entrants.map((e) => (e.playerId === playerId ? { ...e, place, finishedAt: nowIso() } : e));
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

export function setAtTablePlayer(raceId: string, playerId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeAtTablePlayer(raceId, playerId));
}

async function writeAtTablePlayer(raceId: string, playerId: string): Promise<Race> {
  const race = await requireLiveRace(raceId);
  const target = race.entrants.find((e) => e.playerId === playerId);
  if (!target || target.place !== null) {
    throw new AppError('INVALID_STATE', 'That player is not at the table');
  }
  // The picked player plays after whoever shot last, so learn that seat for later visits.
  const lastShooter = race.liveShots?.[race.liveShots.length - 1]?.playerId ?? null;
  const order = raceTurnOrder(race);
  const turnOrder = lastShooter ? movePlayerAfter(order, lastShooter, playerId) : order;
  const updated: Race = { ...race, atTablePlayerId: playerId, turnOrder, updatedAt: nowIso() };
  await persistRace(updated);
  logger.info('race-live.service', 'At-table player set', {
    raceId,
    reordered: turnOrder.join() !== order.join(),
  });
  return updated;
}

export function recordPot(raceId: string, ball: BallValue): Promise<Race> {
  return serializeRaceWrite(raceId, () => writePot(raceId, ball));
}

async function writePot(raceId: string, ball: BallValue): Promise<Race> {
  const parsed = ballSchema.safeParse(ball);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid pot');
  }
  const race = await requireLiveRace(raceId);
  const playerId = atTableId(race);
  const points = racePotPoints(parsed.data);
  let entrants = mapEntrant(race.entrants, playerId, (e) => ({
    ...e,
    score: e.score + points,
  }));
  entrants = applyTarget(entrants, playerId, race.targetScore);
  const stillIn = entrants.find((e) => e.playerId === playerId)?.place === null;
  const nextId = stillIn ? playerId : nextActivePlayerId(entrants, playerId, raceTurnOrder(race));
  const shot: RaceLiveShot = {
    id: createId('rs'),
    at: nowIso(),
    playerId,
    kind: 'pot',
    points,
    ball: parsed.data,
  };
  return appendShot({ ...race, entrants }, shot, nextId);
}

export function recordFoul(raceId: string, points: number): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeFoul(raceId, points));
}

async function writeFoul(raceId: string, points: number): Promise<Race> {
  const parsed = foulSchema.safeParse(points);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Foul must be 4 or 10 points');
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
  return appendShot(
    { ...race, entrants },
    shot,
    nextActivePlayerId(entrants, playerId, raceTurnOrder(race)),
  );
}

/** A miss or a safety: no points, and the table passes to the next player. */
async function recordTurnEnd(raceId: string, kind: 'miss' | 'safety'): Promise<Race> {
  const race = await requireLiveRace(raceId);
  const playerId = atTableId(race);
  const shot: RaceLiveShot = {
    id: createId('rs'),
    at: nowIso(),
    playerId,
    kind,
    points: 0,
  };
  return appendShot(race, shot, nextActivePlayerId(race.entrants, playerId, raceTurnOrder(race)));
}

export function recordMiss(raceId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => recordTurnEnd(raceId, 'miss'));
}

export function recordSafety(raceId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => recordTurnEnd(raceId, 'safety'));
}

export function undoLast(raceId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeUndo(raceId));
}

async function writeUndo(raceId: string): Promise<Race> {
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
      const reopen = placed && netRaceScore({ ...e, score }) < race.targetScore;
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
