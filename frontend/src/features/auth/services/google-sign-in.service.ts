import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { AppError } from '@/shared/errors/app-error';
import { getGoogleWebClientId } from '@/shared/firebase/config';
import { logger } from '@/shared/logging/logger';

/** Root google-services.json (client_type 3 = Web OAuth client). */
type GoogleServicesFile = {
  client?: Array<{
    oauth_client?: Array<{ client_id?: string; client_type?: number }>;
  }>;
};

let configuredWebClientId: string | null = null;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

function webClientIdFromGoogleServices(): string {
  try {
    // Metro resolves JSON from the project root (included in EAS builds).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const googleServices = require('../../../../google-services.json') as GoogleServicesFile;
    const oauth = googleServices.client?.[0]?.oauth_client ?? [];
    const web = oauth.find((c) => c.client_type === 3 && typeof c.client_id === 'string');
    return web?.client_id?.trim() ?? '';
  } catch {
    return '';
  }
}

function resolveWebClientId(): string {
  const fromServices = webClientIdFromGoogleServices();
  if (fromServices.length > 0) {
    return fromServices;
  }
  return getGoogleWebClientId().trim();
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
  const webClientId = resolveWebClientId();
  if (!webClientId) {
    throw new AppError('AUTH_UNAVAILABLE', 'Firebase Google Sign-In is not configured');
  }
  if (configuredWebClientId === webClientId) {
    return;
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  configuredWebClientId = webClientId;
  logger.info('google-sign-in', 'Native GoogleSignin configured', {
    webClientIdSuffix: webClientId.slice(-24),
  });
}

function nativeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') {
    return String(code);
  }
  return undefined;
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
    let idToken = response.data.idToken;
    if (!idToken) {
      try {
        const tokens = await GoogleSignin.getTokens();
        idToken = tokens.idToken;
      } catch (tokenError) {
        logger.error('google-sign-in', 'getTokens after signIn failed', {
          shape: tokenError instanceof Error ? tokenError.name : 'unknown',
        });
      }
    }
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
    const code = nativeErrorCode(error);
    logger.error('google-sign-in', 'Native Google sign-in failed', {
      shape: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : undefined,
      code,
    });
    if (code === '10' || code === 'DEVELOPER_ERROR') {
      throw new AppError(
        'AUTH_MISCONFIGURED',
        'Google rejected this Android build (error 10). Confirm Play Classical SHA-1 matches Firebase, then install the newest closed-testing AAB (versionCode 10+ with google-services.json).',
      );
    }
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
