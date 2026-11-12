import { z } from 'zod';

import {
  compareUnfinished,
  hasReachedTarget,
  nextActivePlayerId,
  raceTurnOrder,
} from '@/features/race/services/race-helpers';
import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { serializeWrite } from '@/shared/utils/serialize-write';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, type ScheduleItem } from '@/shared/sync';
import type {
  FeedEvent,
  GameListOptions,
  Race,
  RaceEntrant,
  RaceKing,
  RacePlace,
} from '@/shared/types/domain';

const createRaceSchema = z.object({
  leagueId: z.string().min(1),
  createdByUid: z.string().min(1),
  playerIds: z.array(z.string().min(1)).min(2).max(12),
  targetScore: z.number().int().min(1).max(500),
  namedLabel: z.string().trim().max(40).nullable(),
  crownsRaceChampion: z.boolean(),
});

/** How long a finished race took (see race-helpers), part of this feature's public surface. */
export { raceDurationSeconds } from '@/features/race/services/race-helpers';

export async function listRaces(leagueId: string, opts?: GameListOptions): Promise<Race[]> {
  await loadStore();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return getStore()
    .races.filter((r) => r.leagueId === leagueId)
    .sort((a, b) =>
      opts?.order === 'started'
        ? b.createdAt.localeCompare(a.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(offset, offset + limit);
}

export async function listLiveRaces(leagueId: string): Promise<Race[]> {
  await loadStore();
  return getStore()
    .races.filter((r) => r.leagueId === leagueId && r.status === 'in_progress')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
}

export async function getRace(raceId: string): Promise<Race | null> {
  await loadStore();
  return getStore().races.find((r) => r.id === raceId) ?? null;
}

export async function createRace(input: {
  leagueId: string;
  createdByUid: string;
  playerIds: string[];
  targetScore: number;
  namedLabel: string | null;
  crownsRaceChampion: boolean;
}): Promise<Race> {
  const parsed = createRaceSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Need at least two players and a target score');
  }
  if (new Set(parsed.data.playerIds).size !== parsed.data.playerIds.length) {
    throw new AppError('VALIDATION', 'Players must be unique');
  }

  const now = nowIso();
  const entrants: RaceEntrant[] = parsed.data.playerIds.map((playerId) => ({
    playerId,
    score: 0,
    foulPoints: 0,
    place: null,
    finishedAt: null,
  }));

  const race: Race = {
    id: createId('rc'),
    leagueId: parsed.data.leagueId,
    createdAt: now,
    updatedAt: now,
    createdByUid: parsed.data.createdByUid,
    targetScore: parsed.data.targetScore,
    namedLabel: parsed.data.namedLabel,
    crownsRaceChampion: parsed.data.crownsRaceChampion,
    entrants,
    status: 'in_progress',
    atTablePlayerId: parsed.data.playerIds[0] ?? null,
    turnOrder: [...parsed.data.playerIds],
    liveShots: [],
  };

  await updateStore((s) => ({ ...s, races: [...s.races, race] }));
  await scheduleSync([
    {
      entity: 'race',
      docId: race.id,
      leagueId: race.leagueId,
      action: 'upsert',
      payload: race,
      updatedAt: race.updatedAt,
    },
  ]);
  logger.info('race.service', 'Race created', { raceId: race.id });
  return race;
}

export function nextPlace(entrants: RaceEntrant[]): number {
  const taken = entrants.map((e) => e.place).filter((p): p is number => typeof p === 'number');
  return taken.length === 0 ? 1 : Math.max(...taken) + 1;
}

export async function persistRace(race: Race, event?: FeedEvent): Promise<Race> {
  let eventId: string | null = null;

  await updateStore((s) => {
    const races = s.races.map((r) => (r.id === race.id ? race : r));
    let leagues = s.leagues;
    let events = s.events;

    if (race.status === 'completed' && race.crownsRaceChampion) {
      const winner = race.entrants.find((e) => e.place === 1);
      if (winner) {
        const king: RaceKing = {
          playerId: winner.playerId,
          raceId: race.id,
          namedLabel: race.namedLabel,
          crownedAt: race.updatedAt,
        };
        leagues = s.leagues.map((l) =>
          l.id === race.leagueId ? { ...l, raceKing: king, updatedAt: nowIso() } : l,
        );
      }
    }

    if (event) {
      const withTs: FeedEvent = {
        ...event,
        updatedAt: event.updatedAt ?? event.createdAt,
      };
      eventId = withTs.id;
      events = [...events, withTs];
    }

    // Derived stats: not an edit of the player, so no updatedAt bump.
    const players = applyPlayerStats(s.players, race.leagueId, {
      matches: s.matches,
      races,
      groupMatches: s.groupMatches,
    });

    return { ...s, races, leagues, events, players };
  });

  const store = getStore();
  const syncedLeague =
    race.status === 'completed' && race.crownsRaceChampion
      ? (store.leagues.find((l) => l.id === race.leagueId) ?? null)
      : null;
  const syncedEvent = eventId ? store.events.find((e) => e.id === eventId) : undefined;

  const items: ScheduleItem[] = [
    {
      entity: 'race',
      docId: race.id,
      leagueId: race.leagueId,
      action: 'upsert',
      payload: race,
      updatedAt: race.updatedAt,
    },
  ];
  if (syncedLeague) {
    items.push({
      entity: 'league',
      docId: syncedLeague.id,
      leagueId: null,
      action: 'upsert',
      payload: syncedLeague,
      updatedAt: syncedLeague.updatedAt,
      fieldsOnly: ['raceKing', 'updatedAt'],
    });
  }
  if (syncedEvent) {
    items.push({
      entity: 'event',
      docId: syncedEvent.id,
      leagueId: syncedEvent.leagueId,
      action: 'upsert',
      payload: syncedEvent,
      updatedAt: syncedEvent.updatedAt,
    });
  }
  // Player stats are not uploaded: the server computes its own from the matches and races
  // (backend/internal/stats), and this phone already recomputed them for display.
  await scheduleSync(items);
  return race;
}

/**
 * Run writes to one race one at a time, in call order (see shared serializeWrite), so two
 * quick taps can never both read the same race and lose a change. Never call one wrapped
 * function from inside another for the same race: it would wait for itself.
 */
export function serializeRaceWrite<T>(raceId: string, write: () => Promise<T>): Promise<T> {
  return serializeWrite(`race:${raceId}`, write);
}

export function setEntrantScore(raceId: string, playerId: string, score: number): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeEntrantScore(raceId, playerId, score));
}

async function writeEntrantScore(raceId: string, playerId: string, score: number): Promise<Race> {
  if (!Number.isFinite(score)) {
    throw new AppError('VALIDATION', 'Score must be a number');
  }

  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (race.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished');
  }

  let entrants = race.entrants.map((e) => {
    if (e.playerId !== playerId) {
      return e;
    }
    if (e.place !== null) {
      return e;
    }
    return { ...e, score: Math.max(0, Math.floor(score)), foulPoints: e.foulPoints ?? 0 };
  });

  const targetHit = entrants.find(
    (e) => e.playerId === playerId && hasReachedTarget(e, race.targetScore),
  );
  if (targetHit) {
    const place = nextPlace(entrants);
    entrants = entrants.map((e) =>
      e.playerId === playerId ? { ...e, place, finishedAt: nowIso() } : e,
    );
  }

  const atTablePlayerId =
    targetHit && race.atTablePlayerId === playerId
      ? nextActivePlayerId(entrants, playerId, raceTurnOrder(race))
      : (race.atTablePlayerId ?? null);

  const updated: Race = { ...race, entrants, atTablePlayerId, updatedAt: nowIso() };
  await persistRace(updated);
  return updated;
}

export function adjustEntrantScore(raceId: string, playerId: string, delta: number): Promise<Race> {
  return serializeRaceWrite(raceId, async () => {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new AppError('VALIDATION', 'Score change must be a number');
    }
    await loadStore();
    const race = getStore().races.find((r) => r.id === raceId);
    if (!race) {
      throw new AppError('NOT_FOUND', 'Race not found');
    }
    const current = race.entrants.find((e) => e.playerId === playerId);
    if (!current) {
      throw new AppError('NOT_FOUND', 'Player is not in this race');
    }
    return writeEntrantScore(raceId, playerId, current.score + Math.trunc(delta));
  });
}

export function markDnf(raceId: string, playerId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeDnf(raceId, playerId));
}

async function writeDnf(raceId: string, playerId: string): Promise<Race> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (race.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished');
  }

  const entrants = race.entrants.map((e) => {
    if (e.playerId !== playerId || e.place !== null) {
      return e;
    }
    return { ...e, place: 'dnf' as RacePlace, finishedAt: nowIso() };
  });

  const atTablePlayerId =
    race.atTablePlayerId === playerId
      ? nextActivePlayerId(entrants, playerId, raceTurnOrder(race))
      : (race.atTablePlayerId ?? null);

  const updated: Race = { ...race, entrants, atTablePlayerId, updatedAt: nowIso() };
  await persistRace(updated);
  logger.info('race.service', 'Entrant marked did not finish', { raceId, playerId });
  return updated;
}

/** Put a mistaken "didn't finish" entrant back into the race (in progress only). */
export function undoDnf(raceId: string, playerId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeUndoDnf(raceId, playerId));
}

async function writeUndoDnf(raceId: string, playerId: string): Promise<Race> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (race.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished - cannot undo');
  }

  const target = race.entrants.find((e) => e.playerId === playerId);
  if (!target || target.place !== 'dnf') {
    throw new AppError('INVALID_STATE', 'Player is not marked as did not finish');
  }

  const entrants = race.entrants.map((e) => {
    if (e.playerId !== playerId) {
      return e;
    }
    return { ...e, place: null, finishedAt: null };
  });

  const updated: Race = { ...race, entrants, updatedAt: nowIso() };
  await persistRace(updated);
  logger.info('race.service', 'Entrant did-not-finish undone', { raceId, playerId });
  return updated;
}

/**
 * Places for players still playing when a race is completed by hand: live score, then fewer
 * fouls, then more potted. Players level on all three share a place, and the next place
 * skips accordingly (two players sharing 2nd are followed by 4th).
 */
export function placesForUnfinished(entrants: RaceEntrant[]): Map<string, number> {
  const sorted = entrants.filter((e) => e.place === null).sort(compareUnfinished);
  const start = nextPlace(entrants);
  const places = new Map<string, number>();
  sorted.forEach((entrant, i) => {
    const prev = sorted[i - 1];
    const prevPlace = prev ? places.get(prev.playerId) : undefined;
    places.set(
      entrant.playerId,
      prev && prevPlace !== undefined && compareUnfinished(prev, entrant) === 0
        ? prevPlace
        : start + i,
    );
  });
  return places;
}

export function completeRace(raceId: string): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeCompleteRace(raceId));
}

async function writeCompleteRace(raceId: string): Promise<Race> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (race.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished');
  }

  const placeMap = placesForUnfinished(race.entrants);
  const now = nowIso();
  const entrants = race.entrants.map((e) => {
    const place = placeMap.get(e.playerId);
    return e.place === null && place !== undefined ? { ...e, place, finishedAt: now } : e;
  });

  const updated: Race = {
    ...race,
    entrants,
    status: 'completed',
    updatedAt: now,
  };

  const winner = entrants.find((e) => e.place === 1);
  const event: FeedEvent = {
    id: createId('ev'),
    leagueId: race.leagueId,
    type: race.crownsRaceChampion ? 'race_king' : 'race_won',
    createdAt: now,
    updatedAt: now,
    title: race.crownsRaceChampion ? 'New race king' : 'Race complete',
    body: race.namedLabel ?? `Race to ${race.targetScore}`,
    relatedIds: winner ? [winner.playerId, race.id] : [race.id],
  };

  await persistRace(updated, event);
  logger.info('race.service', 'Race completed', { raceId });
  return updated;
}

export function submitFinalStandings(
  raceId: string,
  standings: Array<{ playerId: string; score: number; place: number | 'dnf' }>,
): Promise<Race> {
  return serializeRaceWrite(raceId, () => writeFinalStandings(raceId, standings));
}

async function writeFinalStandings(
  raceId: string,
  standings: Array<{ playerId: string; score: number; place: number | 'dnf' }>,
): Promise<Race> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }

  const byId = new Map(standings.map((s) => [s.playerId, s]));
  const now = nowIso();
  const entrants = race.entrants.map((e) => {
    const row = byId.get(e.playerId);
    if (!row) {
      return { ...e, place: 'dnf' as RacePlace, finishedAt: now };
    }
    return {
      ...e,
      score: row.score,
      place: row.place,
      finishedAt: now,
    };
  });

  const updated: Race = {
    ...race,
    entrants,
    status: 'completed',
    updatedAt: now,
  };

  const event: FeedEvent = {
    id: createId('ev'),
    leagueId: race.leagueId,
    type: race.crownsRaceChampion ? 'race_king' : 'race_won',
    createdAt: now,
    updatedAt: now,
    title: race.crownsRaceChampion ? 'New race king' : 'Race logged',
    body: race.namedLabel ?? `Race to ${race.targetScore}`,
    relatedIds: [race.id],
  };

  await persistRace(updated, event);
  return updated;
}
