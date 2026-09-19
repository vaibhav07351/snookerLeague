import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import { useCallback } from 'react';

import { extractGoogleIdToken } from '@/features/auth/services/auth.service';
import { AppError } from '@/shared/errors/app-error';
import { getGoogleWebClientId } from '@/shared/firebase/config';

interface GoogleSignInApi {
  ready: boolean;
  promptIdToken: () => Promise<string | null>;
}

/** Stable public web origin — register this in Google Cloud OAuth + Firebase authorized domains. */
const PRODUCTION_WEB_ORIGIN = 'https://snookit.expo.app';

function envWebOrigin(): string {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return (process.env.EXPO_PUBLIC_WEB_ORIGIN ?? extra?.EXPO_PUBLIC_WEB_ORIGIN ?? '').trim();
}

/**
 * Localhost for dev; stable production URL on EAS Hosting (preview URLs change every deploy).
 */
function getWebRedirectUri(): string {
  if (typeof window === 'undefined') {
    return makeRedirectUri({ preferLocalhost: true });
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return makeRedirectUri({ preferLocalhost: true });
  }
  const configured = envWebOrigin();
  if (configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  if (host.endsWith('.expo.app')) {
    return PRODUCTION_WEB_ORIGIN;
  }
  return `${window.location.origin}`;
}

/**
 * Web only — browser OAuth with an https redirect (custom schemes are rejected).
 */
export function useGoogleSignIn(): GoogleSignInApi {
  const clientId = getGoogleWebClientId() || 'demo.apps.googleusercontent.com';
  const redirectUri = getWebRedirectUri();
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
  });

  const promptIdToken = useCallback(async (): Promise<string | null> => {
    if (!request) {
      throw new AppError(
        'AUTH_UNAVAILABLE',
        'Auth request is still loading. Try again in a moment.',
      );
    }
    const result = await promptAsync();
    if (!result || result.type === 'dismiss' || result.type === 'cancel') {
      return null;
    }
    if (result.type !== 'success') {
      throw new AppError('AUTH_FAILED', 'Google sign-in failed. Please try again.');
    }
    const idToken = extractGoogleIdToken(result);
    if (!idToken) {
      throw new AppError(
        'AUTH_FAILED',
        'Google did not return an ID token. Check that the Web client ID matches Firebase Authentication → Google.',
      );
    }
    return idToken;
  }, [request, promptAsync]);

  return {
    ready: request != null,
    promptIdToken,
  };
}
