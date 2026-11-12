import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  previewClaimLink,
  redeemClaimLink,
  type ClaimPreview,
} from '@/features/players/services/claim-link.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';

export type ClaimState =
  | { kind: 'loading' }
  | { kind: 'needs-sign-in' }
  /** preview is null when the server could not name the player and league. */
  | { kind: 'confirm'; preview: ClaimPreview | null; claiming: boolean }
  | { kind: 'failed'; message: string };

/**
 * A claim link: show who and which league it is for, and only take the card over when the
 * person says yes (opening a link never changes anything by itself).
 */
export function useClaimLink(token: string | undefined): {
  state: ClaimState;
  claim: () => Promise<void>;
} {
  const { ready, user, refresh } = useSession();
  const [state, setState] = useState<ClaimState>({ kind: 'loading' });

  useEffect(() => {
    if (!ready || !token) {
      return;
    }
    if (!user || user.isDemo) {
      setState({ kind: 'needs-sign-in' });
      return;
    }
    let alive = true;
    previewClaimLink(token)
      .then((preview) => {
        if (alive) {
          setState({ kind: 'confirm', preview, claiming: false });
        }
      })
      .catch((error: unknown) => {
        if (alive) {
          setState({ kind: 'failed', message: toUserMessage(error) });
        }
      });
    return () => {
      alive = false;
    };
  }, [ready, token, user]);

  const claim = useCallback(async () => {
    if (!token || state.kind !== 'confirm' || state.claiming) {
      return;
    }
    setState({ ...state, claiming: true });
    try {
      await redeemClaimLink(token);
      await refresh();
      notify.success('Player claimed', 'Your matches are now on your account.');
      router.replace('/(main)');
    } catch (error) {
      setState({ kind: 'failed', message: toUserMessage(error) });
    }
  }, [token, state, refresh]);

  return { state, claim };
}
