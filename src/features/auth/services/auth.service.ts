import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { signOutGoogleNative } from '@/features/auth/services/google-sign-in.service';
import { getFirebaseAuth, isFirebaseEnabled } from '@/shared/firebase/app';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
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
      m.createdByUid === fromUid ? { ...m, createdByUid: toUid, updatedAt: stamp } : m,
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

export async function signInWithGoogleIdToken(idToken: string): Promise<SessionUser> {
  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseEnabled()) {
    throw new AppError('AUTH_UNAVAILABLE', 'Firebase Google Sign-In is not configured');
  }
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  const user: SessionUser = {
    uid: result.user.uid,
    displayName: result.user.displayName ?? 'Player',
    email: result.user.email,
    photoUrl: result.user.photoURL,
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
  // Sync pull restores DOB / city / leagues from Firestore for returning users.
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

  const auth = getFirebaseAuth();
  if (!auth || !isFirebaseEnabled()) {
    throw new AppError('AUTH_UNAVAILABLE', 'Firebase Google Sign-In is not configured');
  }
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  const googleUid = result.user.uid;

  const user: SessionUser = {
    uid: googleUid,
    displayName: result.user.displayName?.trim() || demoName,
    email: result.user.email,
    photoUrl: result.user.photoURL,
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
  const auth = getFirebaseAuth();
  try {
    if (auth && isFirebaseEnabled() && auth.currentUser) {
      await firebaseSignOut(auth);
    }
  } catch (error) {
    logger.error('auth.service', 'Firebase sign-out failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
  await updateStore((s) => ({ ...s, user: null, activeLeagueId: null }));
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

export { isFirebaseEnabled };
