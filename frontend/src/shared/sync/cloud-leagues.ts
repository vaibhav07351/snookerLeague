import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import { leagueKindOf, type AppDataStore } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';

/** The store without one league and everything in it (pure; callers save the result). */
export function withoutLeague(s: AppDataStore, leagueId: string): AppDataStore {
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
    players: s.players.filter((p) => p.leagueId !== leagueId),
    matches: s.matches.filter((m) => m.leagueId !== leagueId),
    races: s.races.filter((r) => r.leagueId !== leagueId),
    events: s.events.filter((e) => e.leagueId !== leagueId),
    pendingOps: s.pendingOps.filter((op) => op.leagueId !== leagueId && op.docId !== leagueId),
  };
}

/** The league was deleted or left: drop it and everything in it from this phone. */
export async function removeLeagueLocally(leagueId: string): Promise<void> {
  logger.info('sync.cloud-leagues', 'Removing league from this phone', { leagueId });
  await updateStore((s) => withoutLeague(s, leagueId));
}

/**
 * The server says we are not a member of this league (for example removed from it on
 * another phone). Drop it from this phone and say so once, instead of failing forever.
 */
export async function dropUnreachableLeague(leagueId: string): Promise<void> {
  const league = getStore().leagues.find((l) => l.id === leagueId);
  if (!league) {
    return;
  }
  logger.warn('sync.cloud-leagues', 'Not a member on the server; removing league locally', {
    leagueId,
  });
  await removeLeagueLocally(leagueId);
  if (leagueKindOf(league) !== 'city') {
    notify.info(
      `Removed "${league.name}"`,
      'You are not a member of this league online. Ask for a fresh invite link to join again.',
    );
  }
}
