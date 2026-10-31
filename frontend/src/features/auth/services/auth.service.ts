import * as WebBrowser from 'expo-web-browser';

import { signOutGoogleNative } from '@/features/auth/services/google-sign-in.service';
import { apiErrorMeta } from '@/shared/api/client';
import { signInWithGoogle, signOutOfApi, type ApiUser } from '@/shared/api/auth-api';
import { isCloudEnabled } from '@/shared/config/env';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { clearSessionPreferences } from '@/shared/storage/preferences';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { syncAfterGoogleSignIn } from '@/shared/sync';
import { stopWatchingActiveLeague } from '@/shared/sync/watch';
import type { AppDataStore, SessionUser } from '@/shared/types/domain';

WebBrowser.maybeCompleteAuthSession();

function remapUid(list: string[], fromUid: string, toUid: string): string[] {
  return [...new Set(list.map((id) => (id === fromUid ? toUid : id)))];
}

/** Rewrite local demo ownership so leagues/players follow the Google uid. */
function migrateDemoUidInStore(store: AppDataStore, fromUid: string, toUid: string): AppDataStore {
  const stamp = nowIso();
  return {
    ...store,
    leagues: store.leagues.map((l) => ({
      ...l,
      createdByUid: l.createdByUid === fromUid ? toUid : l.createdByUid,
      memberUids: remapUid(l.memberUids, fromUid, toUid),
      updatedAt: stamp,
    })),
    players: store.players.map((p) =>
      p.authUid === fromUid
        ? { ...p, authUid: toUid, kind: 'member' as const, updatedAt: stamp }
        : p,
    ),
    matches: store.matches.map((m) =>
      m.createdByUid === fromUid || m.scorerUid === fromUid
        ? {
            ...m,
            createdByUid: m.createdByUid === fromUid ? toUid : m.createdByUid,
            // Keep scoring their own live matches after linking Google.
            ...(m.scorerUid === fromUid ? { scorerUid: toUid } : {}),
            ...(m.allowedScorerUids
              ? { allowedScorerUids: remapUid(m.allowedScorerUids, fromUid, toUid) }
              : {}),
            updatedAt: stamp,
          }
        : m,
    ),
    races: store.races.map((r) =>
      r.createdByUid === fromUid ? { ...r, createdByUid: toUid, updatedAt: stamp } : r,
    ),
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  await loadStore();
  return getStore().user;
}

export async function signInDemo(
  displayName: string,
  dateOfBirth?: string | null,
): Promise<SessionUser> {
  const name = displayName.trim();
  if (name.length < 2) {
    throw new AppError('VALIDATION', 'Enter a display name (at least 2 characters)');
  }
  const user: SessionUser = {
    uid: createId('user'),
    displayName: name,
    email: null,
    photoUrl: null,
    isDemo: true,
    cityId: null,
    cityName: null,
    dateOfBirth: dateOfBirth ?? null,
  };
  stopWatchingActiveLeague();
  await updateStore((s) => ({ ...s, user }));
  logger.info('auth.service', 'Demo sign-in', { uid: user.uid });
  return user;
}

/** Exchange the Google id token for a Snookit session (the API must be configured). */
async function signInToApi(idToken: string): Promise<ApiUser> {
  if (!isCloudEnabled()) {
    throw new AppError('AUTH_UNAVAILABLE', 'Online sign-in is not configured');
  }
  try {
    return await signInWithGoogle(idToken);
  } catch (error) {
    logger.error('auth.service', 'API sign-in failed', apiErrorMeta(error));
    throw new AppError('AUTH_FAILED', 'Could not sign in. Check your connection and try again.');
  }
}

export async function signInWithGoogleIdToken(idToken: string): Promise<SessionUser> {
  const account = await signInToApi(idToken);
  const user: SessionUser = {
    uid: account.id,
    displayName: account.displayName || 'Player',
    email: account.email || null,
    photoUrl: account.photoUrl || null,
    isDemo: false,
    cityId: null,
    cityName: null,
    dateOfBirth: null,
  };
  await updateStore((s) => ({ ...s, user }));
  try {
    await syncAfterGoogleSignIn(user);
  } catch (error) {
    logger.error('auth.service', 'Post sign-in sync failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
  // The first pull restores city, active league and leagues for returning users.
  const restored = getStore().user;
  logger.info('auth.service', 'Google sign-in', { uid: user.uid });
  return restored?.uid === user.uid ? restored : user;
}

/**
 * Upgrade a local "Get started" profile to Google. Keeps leagues/matches by
 * remapping the demo uid → Google uid, then starts cloud sync.
 */
export async function linkDemoAccountWithGoogleIdToken(idToken: string): Promise<SessionUser> {
  await loadStore();
  const current = getStore().user;
  if (!current?.isDemo) {
    throw new AppError('INVALID_STATE', 'Only a local profile can be linked to Google');
  }
  const demoUid = current.uid;
  const demoName = current.displayName;

  const account = await signInToApi(idToken);
  const googleUid = account.id;

  const user: SessionUser = {
    uid: googleUid,
    displayName: account.displayName.trim() || demoName,
    email: account.email || null,
    photoUrl: account.photoUrl || null,
    isDemo: false,
    cityId: current.cityId,
    cityName: current.cityName,
    citySkipped: current.citySkipped,
    dateOfBirth: current.dateOfBirth ?? null,
  };

  await updateStore((s) => {
    const migrated = migrateDemoUidInStore(s, demoUid, googleUid);
    return { ...migrated, user };
  });

  try {
    await syncAfterGoogleSignIn(user);
  } catch (error) {
    logger.error('auth.service', 'Post link sync failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
  const restored = getStore().user;
  logger.info('auth.service', 'Demo linked to Google', { fromUid: demoUid, uid: googleUid });
  return restored?.uid === googleUid ? restored : user;
}

export async function signOut(): Promise<void> {
  stopWatchingActiveLeague();
  await signOutGoogleNative();
  if (isCloudEnabled()) {
    try {
      await signOutOfApi();
    } catch (error) {
      // The session is forgotten on this phone either way; the server's copy expires.
      logger.warn('auth.service', 'Server sign-out failed', apiErrorMeta(error));
    }
  }
  // Sync bookkeeping belongs to the account: the next sign-in pulls from the start.
  await updateStore((s) => ({
    ...s,
    user: null,
    activeLeagueId: null,
    serverVersions: {},
    syncCursor: 0,
  }));
  await clearSessionPreferences();
  logger.info('auth.service', 'Signed out');
}

export function extractGoogleIdToken(
  result: {
    type: string;
    authentication?: { idToken?: string | null } | null;
    params?: Record<string, string>;
  } | null,
): string | null {
  if (!result || result.type !== 'success') {
    return null;
  }
  const fromParams = result.params?.id_token;
  if (typeof fromParams === 'string' && fromParams.length > 0) {
    return fromParams;
  }
  const fromAuth = result.authentication?.idToken;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) {
    return fromAuth;
  }
  return null;
}

export { isCloudEnabled };
