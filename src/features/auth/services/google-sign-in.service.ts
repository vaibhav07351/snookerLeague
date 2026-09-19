import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { AppError } from '@/shared/errors/app-error';
import { getGoogleWebClientId } from '@/shared/firebase/config';
import { logger } from '@/shared/logging/logger';

let configured = false;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

async function loadNativeGoogleSignIn(): Promise<
  typeof import('@react-native-google-signin/google-signin')
> {
  try {
    return await import('@react-native-google-signin/google-signin');
  } catch (error) {
    logger.error('google-sign-in', 'Native Google module missing', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError(
      'AUTH_UNAVAILABLE',
      'This app version cannot use Google sign-in. Install the latest build from the Play Store.',
    );
  }
}

function ensureConfigured(
  GoogleSignin: (typeof import('@react-native-google-signin/google-signin'))['GoogleSignin'],
): void {
  if (configured) {
    return;
  }
  const webClientId = getGoogleWebClientId();
  if (!webClientId) {
    throw new AppError('AUTH_UNAVAILABLE', 'Firebase Google Sign-In is not configured');
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    scopes: ['openid', 'profile', 'email'],
  });
  configured = true;
}

/**
 * Play Store / standalone builds must use the native Google SDK. Browser OAuth
 * with snooker:// is rejected (Error 400: invalid_request).
 */
export async function promptNativeGoogleIdToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    throw new AppError('AUTH_UNAVAILABLE', 'Use the web Google sign-in flow in the browser');
  }
  if (isExpoGo()) {
    throw new AppError(
      'AUTH_UNAVAILABLE',
      'Google sign-in needs the Play Store app or a development build. Expo Go cannot complete Google login.',
    );
  }

  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } =
    await loadNativeGoogleSignIn();
  ensureConfigured(GoogleSignin);

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      return null;
    }
    if (!isSuccessResponse(response)) {
      throw new AppError('AUTH_FAILED', 'Google sign-in failed. Please try again.');
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new AppError(
        'AUTH_FAILED',
        'Google did not return an ID token. Check that the Web client ID matches Firebase Authentication → Google.',
      );
    }
    return idToken;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
      throw new AppError('AUTH_IN_PROGRESS', 'Google sign-in is already in progress.');
    }
    if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new AppError(
        'AUTH_UNAVAILABLE',
        'Google Play Services is missing or out of date on this phone.',
      );
    }
    const code = isErrorWithCode(error) ? error.code : undefined;
    if (code === '10' || code === 'DEVELOPER_ERROR') {
      throw new AppError(
        'AUTH_MISCONFIGURED',
        'Google sign-in is misconfigured. Add both the Play App Signing SHA-1 and the EAS upload SHA-1 to the Firebase Android app (com.snooker.league).',
      );
    }
    logger.error('google-sign-in', 'Native Google sign-in failed', {
      shape: error instanceof Error ? error.name : 'unknown',
      code,
    });
    throw new AppError('AUTH_FAILED', 'Google sign-in failed. Please try again.');
  }
}

export async function signOutGoogleNative(): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo()) {
    return;
  }
  try {
    const { GoogleSignin } = await loadNativeGoogleSignIn();
    ensureConfigured(GoogleSignin);
    await GoogleSignin.signOut();
  } catch (error) {
    logger.error('google-sign-in', 'Native Google sign-out failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}
