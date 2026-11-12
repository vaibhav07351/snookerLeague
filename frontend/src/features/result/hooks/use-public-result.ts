import { useCallback, useEffect, useState } from 'react';

import { loadPublicResult } from '@/features/result/services/public-result.service';
import type { ResultKind, ResultView } from '@/features/result/types/result.types';
import { toUserMessage } from '@/shared/errors/app-error';

export type PublicResultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; view: ResultView }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

/**
 * Fetches a game's public result when `enabled` (the game is not on this phone). Returns
 * the state plus a retry for the error state.
 */
export function usePublicResult(
  kind: ResultKind,
  id: string | undefined,
  enabled: boolean,
): { state: PublicResultState; retry: () => void } {
  const [state, setState] = useState<PublicResultState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return undefined;
    }
    if (!id) {
      setState({ status: 'not_found' });
      return undefined;
    }
    let live = true;
    setState({ status: 'loading' });
    loadPublicResult(kind, id).then(
      (view) => {
        if (live) {
          setState(view ? { status: 'ready', view } : { status: 'not_found' });
        }
      },
      (error: unknown) => {
        if (live) {
          setState({ status: 'error', message: toUserMessage(error) });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [kind, id, enabled, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}
