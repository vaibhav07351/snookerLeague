import { logger } from '@/shared/logging/logger';
import { getFirebaseAuth, waitForFirebaseAuth } from '@/shared/firebase/app';
import { getStore, loadStore } from '@/shared/storage/local-store';
import {
  isOnline,
  startConnectivity,
  stopConnectivity,
  subscribeConnectivity,
} from '@/shared/sync/connectivity';
import { firebaseErrorMeta, isNetworkError } from '@/shared/sync/firebase-error';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { shouldCloudSync } from '@/shared/sync/firestore-paths';
import { removeLeagueLocally } from '@/shared/sync/cloud-leagues';
import { leagueExistsRemote, pullUserAndLeagues } from '@/shared/sync/pull';
import { upsertCloudUser } from '@/shared/sync/push';
import {
  buildCloudUserPayload,
  flushPending,
  scheduleSync,
  scheduleUserProfileSync,
} from '@/shared/sync/schedule';
import { stopWatchingActiveLeague, watchActiveLeague } from '@/shared/sync/watch';
import type { SessionUser } from '@/shared/types/domain';

let runtimeStarted = false;
let removeConnectivity: (() => void) | null = null;
let removeAuth: (() => void) | null = null;
let wasOnline = true;

/**
 * Restore cloud profile first, then upsert. A blank fresh-session user must never
 * be written before pull - merge:true would wipe DOB / city / leagueIds.
 */
export async function syncAfterGoogleSignIn(user: SessionUser): Promise<void> {
  await waitForFirebaseAuth();
  if (!shouldCloudSync(user)) {
    logger.error('sync.runtime', 'Skipping cloud sync - Firebase Auth not ready for user', {
      uid: user.uid,
      authUid: getFirebaseAuth()?.currentUser?.uid ?? null,
    });
    return;
  }
  await loadStore();

  if (isOnline()) {
    try {
      await pullUserAndLeagues(user.uid);
    } catch (error) {
      logger.error('sync.runtime', 'Initial pull failed', firebaseErrorMeta(error));
    }
  }

  // Prefer the store user after pull (restored DOB/city/leagues); fall back to sign-in shell.
  const sessionUser = getStore().user?.uid === user.uid ? (getStore().user as SessionUser) : user;
  const profile = buildCloudUserPayload(sessionUser);
  try {
    if (isOnline()) {
      await upsertCloudUser(profile);
    } else {
      await scheduleSync([
        {
          entity: 'user',
          docId: sessionUser.uid,
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
        docId: sessionUser.uid,
        leagueId: null,
        action: 'upsert',
        payload: profile,
        updatedAt: profile.updatedAt,
      },
    ]);
  }

  // Seed cloud with any local leagues this user already owns (first sync).
  await seedLocalLeaguesToCloud(sessionUser);

  if (isOnline()) {
    await flushPending();
    try {
      await pullUserAndLeagues(sessionUser.uid);
    } catch (error) {
      logger.error('sync.runtime', 'Post-seed pull failed', firebaseErrorMeta(error));
    }
  }

  watchActiveLeague(getStore().activeLeagueId);
}

/**
 * First upload of leagues that only exist on this phone (e.g. created in demo mode, or
 * offline). Leagues already in the cloud are skipped: the pull merges them instead, so a
 * reconnect can never overwrite newer cloud data with an old local copy.
 */
async function seedLocalLeaguesToCloud(user: SessionUser): Promise<void> {
  const store = getStore();
  const items: Parameters<typeof scheduleSync>[0] = [];

  const owned = store.leagues.filter(
    (l) => l.memberUids.includes(user.uid) && l.createdByUid === user.uid,
  );
  const localOnly: typeof owned = [];
  if (isOnline()) {
    for (const league of owned) {
      try {
        if (await leagueExistsRemote(league.id)) {
          continue;
        }
        if ((store.cloudLeagueIds ?? []).includes(league.id)) {
          // It was in the cloud before and is gone now: deleted on another phone.
          await removeLeagueLocally(league.id);
        } else {
          localOnly.push(league);
        }
      } catch (error) {
        logger.warn('sync.runtime', 'Could not check league in cloud; skipping seed', {
          ...firebaseErrorMeta(error),
          leagueId: league.id,
        });
      }
    }
  }

  for (const league of localOnly) {
    items.push({
      entity: 'invite',
      docId: league.inviteCode,
      leagueId: null,
      action: 'upsert',
      payload: {
        code: league.inviteCode,
        leagueId: league.id,
        leagueName: league.name,
        createdByUid: league.createdByUid,
        updatedAt: league.updatedAt,
      },
      updatedAt: league.updatedAt,
    });
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

  if (items.length > 0) {
    await scheduleSync(items);
  }
}

export async function onActiveLeagueChanged(leagueId: string | null): Promise<void> {
  await waitForFirebaseAuth();
  await scheduleUserProfileSync();
  watchActiveLeague(leagueId);
}

let reconnecting: Promise<void> | null = null;

/** Single-flight: start-up and auth callbacks can both ask for a reconnect at once. */
export function onReconnect(): Promise<void> {
  reconnecting ??= reconnect().finally(() => {
    reconnecting = null;
  });
  return reconnecting;
}

async function reconnect(): Promise<void> {
  await waitForFirebaseAuth();
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user) || !user) {
    stopWatchingActiveLeague();
    if (user && !user.isDemo) {
      logger.error('sync.runtime', 'Cloud sync paused - sign in with Google again to sync', {
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
    setCloudReachable(true);
    // Keep the cloud profile's league list in step (e.g. after dropping a league we are
    // not a member of), so the next pull does not try it again.
    await scheduleUserProfileSync();
  } catch (error) {
    logger.error('sync.runtime', 'Reconnect pull failed', firebaseErrorMeta(error));
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
    stopConnectivity();
    runtimeStarted = false;
  };
}

export function stopSyncRuntime(): void {
  removeConnectivity?.();
  removeConnectivity = null;
  removeAuth?.();
  removeAuth = null;
  stopWatchingActiveLeague();
  stopConnectivity();
  runtimeStarted = false;
}

export { scheduleSync, scheduleUserProfileSync, flushPending, shouldCloudSync };
export type { ScheduleItem } from '@/shared/sync/schedule';
