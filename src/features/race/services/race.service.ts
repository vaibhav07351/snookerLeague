import { z } from 'zod';

import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import type { FeedEvent, Race, RaceEntrant, RaceKing, RacePlace } from '@/shared/types/domain';

const createRaceSchema = z.object({
  leagueId: z.string().min(1),
  createdByUid: z.string().min(1),
  playerIds: z.array(z.string().min(1)).min(2).max(12),
  targetScore: z.number().int().min(1).max(500),
  namedLabel: z.string().trim().max(40).nullable(),
  crownsRaceChampion: z.boolean(),
});

export async function listRaces(
  leagueId: string,
  opts?: { limit?: number; offset?: number },
): Promise<Race[]> {
  await loadStore();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return getStore()
    .races.filter((r) => r.leagueId === leagueId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(offset, offset + limit);
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
  };

  await updateStore((s) => ({ ...s, races: [...s.races, race] }));
  logger.info('race.service', 'Race created', { raceId: race.id });
  return race;
}

function nextPlace(entrants: RaceEntrant[]): number {
  const taken = entrants
    .map((e) => e.place)
    .filter((p): p is number => typeof p === 'number');
  return taken.length === 0 ? 1 : Math.max(...taken) + 1;
}

async function persistRace(race: Race, event?: FeedEvent): Promise<Race> {
  await updateStore((s) => {
    const races = s.races.map((r) => (r.id === race.id ? race : r));
    let leagues = s.leagues;
    let events = event ? [...s.events, event] : s.events;

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
          l.id === race.leagueId ? { ...l, raceKing: king } : l,
        );
      }
    }

    const players = applyPlayerStats(s.players, race.leagueId, s.matches, races);
    return { ...s, races, leagues, events, players };
  });
  return race;
}

export async function setEntrantScore(
  raceId: string,
  playerId: string,
  score: number,
): Promise<Race> {
  if (!Number.isFinite(score) || score < 0) {
    throw new AppError('VALIDATION', 'Score must be a non-negative number');
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
    return { ...e, score: Math.floor(score) };
  });

  const targetHit = entrants.find(
    (e) => e.playerId === playerId && e.place === null && e.score >= race.targetScore,
  );
  if (targetHit) {
    const place = nextPlace(entrants);
    entrants = entrants.map((e) =>
      e.playerId === playerId
        ? { ...e, place, finishedAt: nowIso(), score: Math.max(e.score, race.targetScore) }
        : e,
    );
  }

  const updated: Race = { ...race, entrants, updatedAt: nowIso() };
  await persistRace(updated);
  return updated;
}

export async function markDnf(raceId: string, playerId: string): Promise<Race> {
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

  const updated: Race = { ...race, entrants, updatedAt: nowIso() };
  await persistRace(updated);
  logger.info('race.service', 'Entrant DNF', { raceId, playerId });
  return updated;
}

export async function completeRace(raceId: string): Promise<Race> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (race.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Race already finished');
  }

  const unfinished = race.entrants.filter((e) => e.place === null);
  const sorted = [...unfinished].sort((a, b) => b.score - a.score);
  let placeCursor = nextPlace(race.entrants);
  const placeMap = new Map<string, number>();
  for (const entrant of sorted) {
    placeMap.set(entrant.playerId, placeCursor);
    placeCursor += 1;
  }

  const now = nowIso();
  const entrants = race.entrants.map((e) => {
    if (e.place !== null) {
      return e;
    }
    const place = placeMap.get(e.playerId) ?? placeCursor;
    return { ...e, place, finishedAt: now };
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
    title: race.crownsRaceChampion ? 'New race king' : 'Race complete',
    body: race.namedLabel ?? `Race to ${race.targetScore}`,
    relatedIds: winner ? [winner.playerId, race.id] : [race.id],
  };

  await persistRace(updated, event);
  logger.info('race.service', 'Race completed', { raceId });
  return updated;
}

export async function submitFinalStandings(
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
    title: race.crownsRaceChampion ? 'New race king' : 'Race logged',
    body: race.namedLabel ?? `Race to ${race.targetScore}`,
    relatedIds: [race.id],
  };

  await persistRace(updated, event);
  return updated;
}
