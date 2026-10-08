import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { useGoogleSignIn } from '@/features/auth/hooks/use-google-sign-in';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { isFirebaseEnabled } from '@/shared/firebase/app';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';

export interface LinkGoogleApi {
  /** True for a demo user on a build with Google sign-in configured. */
  available: boolean;
  linking: boolean;
  link: () => Promise<void>;
}

/** Move a demo (local-only) profile onto a Google account so it syncs and can join leagues. */
export function useLinkGoogle(): LinkGoogleApi {
  const { user, refresh } = useSession();
  const { ready, promptIdToken } = useGoogleSignIn();
  const [linking, setLinking] = useState(false);
  const available = user?.isDemo === true && isFirebaseEnabled();

  const link = useCallback(async () => {
    if (!user?.isDemo) {
      return;
    }
    if (!isFirebaseEnabled()) {
      notify.error('Cloud not set up', 'Google sign-in is not configured for this build.');
      return;
    }
    if (!ready) {
      notify.info('Please wait', 'Google sign-in is still loading. Try again in a moment.');
      return;
    }
    if (Platform.OS !== 'web') {
      const ok = await confirmAction(
        'Link Google account?',
        'Your local leagues and match history move to this Google login and start syncing.',
        'Continue with Google',
      );
      if (!ok) {
        return;
      }
      // Let the native dialog finish closing before the Google account picker opens.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 400);
      });
    }
    // On web the popup must open straight from the tap, or browsers block it.
    try {
      const idToken = await promptIdToken();
      if (!idToken) {
        return;
      }
      setLinking(true);
      await authService.linkDemoAccountWithGoogleIdToken(idToken);
      await refresh();
      notify.success(
        'Google linked',
        "Your leagues and matches now sync, and you can join friends' leagues.",
      );
      // Back through the start gate, which also resumes an invite saved before linking.
      router.replace('/');
    } catch (error) {
      notify.error('Could not link Google', toUserMessage(error));
    } finally {
      setLinking(false);
    }
  }, [user?.isDemo, ready, promptIdToken, refresh]);

  return { available, linking, link };
}
