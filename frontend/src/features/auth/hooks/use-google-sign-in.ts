import { useCallback } from 'react';

import { promptNativeGoogleIdToken } from '@/features/auth/services/google-sign-in.service';

interface GoogleSignInApi {
  ready: boolean;
  promptIdToken: () => Promise<string | null>;
}

/**
 * Native (Android/iOS) builds — Play Store, preview APK, development builds.
 * Uses the system Google account picker (no browser, no snooker:// redirect).
 */
export function useGoogleSignIn(): GoogleSignInApi {
  const promptIdToken = useCallback(async (): Promise<string | null> => {
    return promptNativeGoogleIdToken();
  }, []);

  return {
    ready: true,
    promptIdToken,
  };
}
