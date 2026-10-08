import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import { leagueKindOf } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';

/** Remember that these leagues exist in the cloud (see AppDataStore.cloudLeagueIds). */
export async function markLeaguesInCloud(leagueIds: string[]): Promise<void> {
  if (leagueIds.length === 0) {
    return;
  }
  await updateStore((s) => {
    const known = new Set(s.cloudLeagueIds ?? []);
    const before = known.size;
    for (const id of leagueIds) {
      known.add(id);
    }
    return known.size === before ? s : { ...s, cloudLeagueIds: [...known] };
  });
}

/** The league was deleted elsewhere: drop it and everything in it from this phone. */
export async function removeLeagueLocally(leagueId: string): Promise<void> {
  logger.info('sync.cloud-leagues', 'League deleted remotely; removing locally', { leagueId });
  await updateStore((s) => {
    if (!s.leagues.some((l) => l.id === leagueId)) {
      return s;
    }
    const leagues = s.leagues.filter((l) => l.id !== leagueId);
    const uid = s.user?.uid;
    const activeLeagueId =
      s.activeLeagueId === leagueId
        ? (leagues.find(
            (l) => uid != null && l.memberUids.includes(uid) && leagueKindOf(l) !== 'city',
          )?.id ?? null)
        : s.activeLeagueId;
    return {
      ...s,
      leagues,
      activeLeagueId,
      cloudLeagueIds: (s.cloudLeagueIds ?? []).filter((id) => id !== leagueId),
      players: s.players.filter((p) => p.leagueId !== leagueId),
      matches: s.matches.filter((m) => m.leagueId !== leagueId),
      races: s.races.filter((r) => r.leagueId !== leagueId),
      events: s.events.filter((e) => e.leagueId !== leagueId),
    };
  });
}

/**
 * The server refused to let us read this league: we are not a member there (for example a
 * join from an older app version that never reached the server). Drop it from this phone
 * and say so once, instead of retrying and failing forever.
 */
export async function dropUnreachableLeague(leagueId: string): Promise<void> {
  const league = getStore().leagues.find((l) => l.id === leagueId);
  if (!league || leagueKindOf(league) === 'city') {
    return;
  }
  logger.warn('sync.cloud-leagues', 'Not a member on the server; removing league locally', {
    leagueId,
  });
  await removeLeagueLocally(leagueId);
  // Loaded lazily: schedule.ts imports this module.
  const { scheduleProfileLeagueRemoval } = await import('@/shared/sync/schedule');
  await scheduleProfileLeagueRemoval(leagueId);
  notify.info(
    `Removed "${league.name}"`,
    'You are not a member of this league online (the earlier join did not complete). Ask for a fresh invite link to join again.',
  );
}
