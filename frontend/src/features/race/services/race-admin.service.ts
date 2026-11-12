import { serializeRaceWrite } from '@/features/race/services/race.service';
import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, type ScheduleItem } from '@/shared/sync';
import { nowIso } from '@/shared/utils/id';
import type { FeedEvent, League, Race, RaceKing } from '@/shared/types/domain';

/** The race creator or the league owner may delete a race (the server applies the same rule). */
export function canManageRace(
  race: Pick<Race, 'createdByUid' | 'leagueId'>,
  uid: string | null | undefined,
): boolean {
  if (!uid) {
    return false;
  }
  const league = getStore().leagues.find((l) => l.id === race.leagueId);
  return race.createdByUid === uid || league?.createdByUid === uid;
}

/** Race king from the latest finished crowning race left in the league, or nobody. */
function latestRaceKing(races: Race[], leagueId: string): RaceKing | null {
  const crowning = races
    .filter((r) => r.leagueId === leagueId && r.crownsRaceChampion && r.status === 'completed')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const race of crowning) {
    const winner = race.entrants.find((e) => e.place === 1);
    if (winner) {
      return {
        playerId: winner.playerId,
        raceId: race.id,
        namedLabel: race.namedLabel,
        crownedAt: race.updatedAt,
      };
    }
  }
  return null;
}

const RACE_RESULT_TYPES: ReadonlySet<FeedEvent['type']> = new Set(['race_won', 'race_king']);

/**
 * Abandon and delete a race. Player stats are recomputed without it, the race king is re-picked
 * when this race crowned them, its result posts are withdrawn, and the delete is synced so it
 * disappears on every device.
 */
export function deleteRace(raceId: string): Promise<void> {
  // After any shot still being saved, so a late save can't bring the race back.
  return serializeRaceWrite(raceId, () => writeDeleteRace(raceId));
}

async function writeDeleteRace(raceId: string): Promise<void> {
  await loadStore();
  const race = getStore().races.find((r) => r.id === raceId);
  if (!race) {
    throw new AppError('NOT_FOUND', 'Race not found');
  }
  if (!canManageRace(race, getStore().user?.uid)) {
    throw new AppError('FORBIDDEN', 'Only the race creator or league owner can do this');
  }

  const now = nowIso();
  const changed: { league: League | null; events: FeedEvent[] } = { league: null, events: [] };
  await updateStore((s) => {
    const races = s.races.filter((r) => r.id !== raceId);
    const leagues = s.leagues.map((l) => {
      if (l.id !== race.leagueId || l.raceKing?.raceId !== raceId) {
        return l;
      }
      const next: League = { ...l, raceKing: latestRaceKing(races, l.id), updatedAt: now };
      changed.league = next;
      return next;
    });
    const events = s.events.map((e) => {
      const isResult =
        e.leagueId === race.leagueId &&
        RACE_RESULT_TYPES.has(e.type) &&
        e.relatedIds.includes(raceId) &&
        !e.retracted;
      if (!isResult) {
        return e;
      }
      const retracted: FeedEvent = { ...e, retracted: true, updatedAt: now };
      changed.events.push(retracted);
      return retracted;
    });
    // Derived stats: not an edit of the player, so no updatedAt bump.
    const players = applyPlayerStats(s.players, race.leagueId, {
      matches: s.matches,
      races,
      groupMatches: s.groupMatches,
    });
    return { ...s, races, leagues, events, players };
  });

  const items: ScheduleItem[] = [
    {
      entity: 'race',
      docId: race.id,
      leagueId: race.leagueId,
      action: 'delete',
      payload: null,
      updatedAt: now,
    },
  ];
  const league = changed.league;
  if (league) {
    items.push({
      entity: 'league',
      docId: league.id,
      leagueId: null,
      action: 'upsert',
      payload: league,
      updatedAt: league.updatedAt,
      fieldsOnly: ['raceKing', 'updatedAt'],
    });
  }
  for (const event of changed.events) {
    items.push({
      entity: 'event',
      docId: event.id,
      leagueId: event.leagueId,
      action: 'upsert',
      payload: event,
      updatedAt: event.updatedAt,
    });
  }
  await scheduleSync(items);
  logger.info('race.service', 'Race deleted', {
    raceId,
    raceKingChanged: league !== null,
    postsWithdrawn: changed.events.length,
  });
}
