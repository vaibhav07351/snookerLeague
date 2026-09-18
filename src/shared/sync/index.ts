import { logger } from '@/shared/logging/logger';
import { getFirebaseAuth, waitForFirebaseAuth } from '@/shared/firebase/app';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { isOnline, startConnectivity, subscribeConnectivity } from '@/shared/sync/connectivity';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import { shouldCloudSync } from '@/shared/sync/firestore-paths';
import { pullUserAndLeagues } from '@/shared/sync/pull';
import { upsertCloudUser } from '@/shared/sync/push';
import {
  buildCloudUserPayload,
  flushPending,
  scheduleSync,
  scheduleUserProfileSync,
} from '@/shared/sync/schedule';
import { stopWatchingActiveLeague, watchActiveLeague } from '@/shared/sync/watch';
import type { SessionUser } from '@/shared/types/domain';
import { nowIso } from '@/shared/utils/id';

let runtimeStarted = false;
let removeConnectivity: (() => void) | null = null;
let removeAuth: (() => void) | null = null;
let wasOnline = true;

/**
 * Upsert users/{uid}, push any local seed data, pull remote leagues, start watchers.
 */
export async function syncAfterGoogleSignIn(user: SessionUser): Promise<void> {
  await waitForFirebaseAuth();
  if (!shouldCloudSync(user)) {
    logger.error('sync.runtime', 'Skipping cloud sync — Firebase Auth not ready for user', {
      uid: user.uid,
      authUid: getFirebaseAuth()?.currentUser?.uid ?? null,
    });
    return;
  }
  await loadStore();

  const profile = buildCloudUserPayload(user);
  try {
    if (isOnline()) {
      await upsertCloudUser(profile);
    } else {
      await scheduleSync([
        {
          entity: 'user',
          docId: user.uid,
          leagueId: null,
          action: 'upsert',
          payload: profile,
          updatedAt: profile.updatedAt,
        },
      ]);
    }
  } catch (error) {
    logger.error('sync.runtime', 'User upsert failed; queued', firebaseErrorMeta(error));
    await scheduleSync([
      {
        entity: 'user',
        docId: user.uid,
        leagueId: null,
        action: 'upsert',
        payload: profile,
        updatedAt: profile.updatedAt,
      },
    ]);
  }

  // Seed cloud with any local leagues this user already owns (first sync).
  await seedLocalLeaguesToCloud(user);

  if (isOnline()) {
    await flushPending();
    try {
      await pullUserAndLeagues(user.uid);
    } catch (error) {
      logger.error('sync.runtime', 'Initial pull failed', firebaseErrorMeta(error));
    }
  }

  watchActiveLeague(getStore().activeLeagueId);
}

async function seedLocalLeaguesToCloud(user: SessionUser): Promise<void> {
  const store = getStore();
  const items: Parameters<typeof scheduleSync>[0] = [];

  for (const league of store.leagues.filter((l) => l.memberUids.includes(user.uid))) {
    items.push({
      entity: 'league',
      docId: league.id,
      leagueId: null,
      action: 'upsert',
      payload: league,
      updatedAt: league.updatedAt,
    });
    for (const player of store.players.filter((p) => p.leagueId === league.id)) {
      items.push({
        entity: 'player',
        docId: player.id,
        leagueId: league.id,
        action: 'upsert',
        payload: player,
        updatedAt: player.updatedAt,
      });
    }
    for (const match of store.matches.filter((m) => m.leagueId === league.id)) {
      items.push({
        entity: 'match',
        docId: match.id,
        leagueId: league.id,
        action: 'upsert',
        payload: match,
        updatedAt: match.updatedAt,
      });
    }
    for (const race of store.races.filter((r) => r.leagueId === league.id)) {
      items.push({
        entity: 'race',
        docId: race.id,
        leagueId: league.id,
        action: 'upsert',
        payload: race,
        updatedAt: race.updatedAt,
      });
    }
    for (const event of store.events.filter((e) => e.leagueId === league.id)) {
      items.push({
        entity: 'event',
        docId: event.id,
        leagueId: league.id,
        action: 'upsert',
        payload: event,
        updatedAt: event.updatedAt,
      });
    }
  }

  items.push({
    entity: 'user',
    docId: user.uid,
    leagueId: null,
    action: 'upsert',
    payload: buildCloudUserPayload(user),
    updatedAt: nowIso(),
  });

  if (items.length > 0) {
    await scheduleSync(items);
  }
}

export async function onActiveLeagueChanged(leagueId: string | null): Promise<void> {
  await waitForFirebaseAuth();
  await scheduleUserProfileSync();
  watchActiveLeague(leagueId);
}

export async function onReconnect(): Promise<void> {
  await waitForFirebaseAuth();
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user) || !user) {
    stopWatchingActiveLeague();
    if (user && !user.isDemo) {
      logger.error('sync.runtime', 'Cloud sync paused — sign in with Google again to sync', {
        uid: user.uid,
        authUid: getFirebaseAuth()?.currentUser?.uid ?? null,
      });
    }
    return;
  }
  await seedLocalLeaguesToCloud(user);
  await flushPending();
  try {
    await pullUserAndLeagues(user.uid);
  } catch (error) {
    logger.error('sync.runtime', 'Reconnect pull failed', firebaseErrorMeta(error));
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
    } else {
      void waitForFirebaseAuth().then(() => {
        if (shouldCloudSync(getStore().user)) {
          watchActiveLeague(getStore().activeLeagueId);
        }
      });
    }
    wasOnline = online;
  });

  const firebaseAuth = getFirebaseAuth();
  if (firebaseAuth) {
    removeAuth = firebaseAuth.onAuthStateChanged((fbUser) => {
      void loadStore().then(() => {
        const local = getStore().user;
        if (fbUser && local && !local.isDemo && local.uid === fbUser.uid && isOnline()) {
          void onReconnect();
        } else if (!fbUser) {
          stopWatchingActiveLeague();
        }
      });
    });
  }

  void (async () => {
    await waitForFirebaseAuth();
    await loadStore();
    if (shouldCloudSync(getStore().user) && isOnline()) {
      await onReconnect();
    } else {
      stopWatchingActiveLeague();
    }
  })();

  return () => {
    removeConnectivity?.();
    removeConnectivity = null;
    removeAuth?.();
    removeAuth = null;
    stopWatchingActiveLeague();
    runtimeStarted = false;
  };
}

export function stopSyncRuntime(): void {
  removeConnectivity?.();
  removeConnectivity = null;
  removeAuth?.();
  removeAuth = null;
  stopWatchingActiveLeague();
  runtimeStarted = false;
}

export { scheduleSync, scheduleUserProfileSync, flushPending, shouldCloudSync };
export type { ScheduleItem } from '@/shared/sync/schedule';
