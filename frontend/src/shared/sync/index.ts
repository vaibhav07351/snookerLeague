import { loadTokens } from '@/shared/api/tokens';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import {
  isOnline,
  startConnectivity,
  stopConnectivity,
  subscribeConnectivity,
} from '@/shared/sync/connectivity';
import { versionKey } from '@/shared/sync/mappers';
import { pullChanges, restoreCloudUser } from '@/shared/sync/pull';
import { flushPending, scheduleSync, scheduleUserProfileSync } from '@/shared/sync/schedule';
import { isNetworkError, syncErrorMeta } from '@/shared/sync/sync-errors';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { stopWatchingActiveLeague, watchActiveLeague } from '@/shared/sync/watch';
import { leagueKindOf, type SessionUser } from '@/shared/types/domain';

let runtimeStarted = false;
let removeConnectivity: (() => void) | null = null;
let wasOnline = true;

/**
 * Right after a Google sign-in: pull everything this account already has, restore its
 * settings, then upload whatever exists only on this phone (for example a demo session's
 * leagues). Pull comes first, so a fresh sign-in never overwrites newer server data.
 */
export async function syncAfterGoogleSignIn(user: SessionUser): Promise<void> {
  await loadStore();
  if (!shouldCloudSync(user)) {
    logger.error('sync.runtime', 'Skipping cloud sync - no API session for this user', {
      uid: user.uid,
    });
    return;
  }
  if (isOnline()) {
    try {
      await pullChanges();
      await restoreCloudUser(user.uid);
    } catch (error) {
      logger.error('sync.runtime', 'Initial pull failed', syncErrorMeta(error));
    }
  }
  await scheduleUserProfileSync();
  await uploadLocalOnlyLeagues(user);
  if (isOnline()) {
    await flushPending();
  }
  watchActiveLeague(getStore().activeLeagueId);
}

/**
 * The "upload everything" path: leagues this user owns that the server has never seen
 * (created in demo mode, or offline before the first sync) are queued with all their
 * players, matches, races and events. Documents with a server version, or with a write
 * already queued, are skipped, so this is safe to run on every reconnect.
 */
async function uploadLocalOnlyLeagues(user: SessionUser): Promise<void> {
  const store = getStore();
  const known = store.serverVersions;
  const queued = new Set(store.pendingOps.map((op) => `${op.entity}:${op.docId}`));
  const unsent = (
    entity: 'league' | 'player' | 'match' | 'race' | 'event' | 'tournament',
    id: string,
  ) => known[versionKey(entity, id)] === undefined && !queued.has(`${entity}:${id}`);

  const items: Parameters<typeof scheduleSync>[0] = [];
  const owned = store.leagues.filter(
    (l) => l.createdByUid === user.uid && leagueKindOf(l) !== 'city',
  );
  for (const league of owned) {
    const children = {
      player: store.players.filter((p) => p.leagueId === league.id),
      match: store.matches.filter((m) => m.leagueId === league.id),
      race: store.races.filter((r) => r.leagueId === league.id),
      event: store.events.filter((e) => e.leagueId === league.id),
      tournament: store.tournaments.filter((t) => t.leagueId === league.id),
    };
    if (unsent('league', league.id)) {
      items.push({
        entity: 'league',
        docId: league.id,
        leagueId: null,
        action: 'upsert',
        payload: league,
        updatedAt: league.updatedAt,
      });
    }
    for (const [entity, rows] of Object.entries(children) as [
      'player' | 'match' | 'race' | 'event' | 'tournament',
      { id: string; updatedAt: string }[],
    ][]) {
      for (const row of rows) {
        if (unsent(entity, row.id)) {
          items.push({
            entity,
            docId: row.id,
            leagueId: league.id,
            action: 'upsert',
            payload: row,
            updatedAt: row.updatedAt,
          });
        }
      }
    }
  }
  if (items.length > 0) {
    logger.info('sync.runtime', 'Uploading data that exists only on this phone', {
      count: items.length,
    });
    await scheduleSync(items);
  }
}

export async function onActiveLeagueChanged(leagueId: string | null): Promise<void> {
  await scheduleUserProfileSync();
  watchActiveLeague(leagueId);
}

let reconnecting: Promise<void> | null = null;

/** Single-flight: start-up and connectivity callbacks can both ask for a reconnect at once. */
export function onReconnect(): Promise<void> {
  reconnecting ??= reconnect().finally(() => {
    reconnecting = null;
  });
  return reconnecting;
}

async function reconnect(): Promise<void> {
  await loadTokens();
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user) || !user) {
    stopWatchingActiveLeague();
    if (user && !user.isDemo) {
      logger.warn('sync.runtime', 'Cloud sync paused - sign in with Google again to sync', {
        uid: user.uid,
      });
    }
    return;
  }
  await uploadLocalOnlyLeagues(user);
  await flushPending();
  try {
    await pullChanges();
    setCloudReachable(true);
  } catch (error) {
    logger.error('sync.runtime', 'Reconnect pull failed', syncErrorMeta(error));
    if (isNetworkError(error)) {
      setCloudReachable(false);
    }
  }
  watchActiveLeague(getStore().activeLeagueId);
}

/** Call once from SessionProvider. */
export function startSyncRuntime(): () => void {
  if (runtimeStarted) {
    return () => undefined;
  }
  runtimeStarted = true;
  startConnectivity();
  wasOnline = isOnline();

  removeConnectivity = subscribeConnectivity((online) => {
    if (online && !wasOnline) {
      void onReconnect();
    }
    if (!online) {
      stopWatchingActiveLeague();
    }
    wasOnline = online;
  });

  void (async () => {
    await loadTokens();
    await loadStore();
    if (shouldCloudSync(getStore().user) && isOnline()) {
      await onReconnect();
    }
  })();

  return stopSyncRuntime;
}

export function stopSyncRuntime(): void {
  removeConnectivity?.();
  removeConnectivity = null;
  stopWatchingActiveLeague();
  stopConnectivity();
  runtimeStarted = false;
}

export { scheduleSync, scheduleUserProfileSync, flushPending, shouldCloudSync };
export type { ScheduleItem } from '@/shared/sync/schedule';
