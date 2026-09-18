import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential, signOut as firebaseSignOut } from 'firebase/auth';
import { Platform } from 'react-native';

import { getFirebaseAuth, isFirebaseEnabled } from '@/shared/firebase/app';
import { getGoogleWebClientId } from '@/shared/firebase/config';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import type { SessionUser } from '@/shared/types/domain';

WebBrowser.maybeCompleteAuthSession();

export async function getCurrentUser(): Promise<SessionUser | null> {
  await loadStore();
  return getStore().user;
}

export async function signInDemo(displayName: string): Promise<SessionUser> {
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
  };
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
  };
  await updateStore((s) => ({ ...s, user }));
  logger.info('auth.service', 'Google sign-in', { uid: user.uid });
  return user;
}

export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth && isFirebaseEnabled()) {
    await firebaseSignOut(auth);
  }
  await updateStore((s) => ({ ...s, user: null, activeLeagueId: null }));
  logger.info('auth.service', 'Signed out');
}

export function useGoogleAuthRequest(): ReturnType<typeof Google.useAuthRequest> {
  const clientId = getGoogleWebClientId() || 'demo.apps.googleusercontent.com';
  // Google *Web* OAuth clients only accept http(s) redirects (e.g. localhost).
  // Custom schemes like snooker:// are rejected — use those only with native iOS/Android clients.
  const redirectUri =
    Platform.OS === 'web'
      ? makeRedirectUri({ preferLocalhost: true })
      : makeRedirectUri({ scheme: 'snooker', path: 'oauth' });
  return Google.useAuthRequest({
    webClientId: clientId,
    iosClientId: clientId,
    androidClientId: clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
  });
}

export { isFirebaseEnabled };
