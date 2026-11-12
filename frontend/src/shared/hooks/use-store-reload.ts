/**
 * Shared store subscription helper for screens.
 * Bumps a tick so read-only reloads re-run without writing the store.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@/shared/logging/logger';
import { subscribeStore } from '@/shared/storage/local-store';

export function useStoreTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    return subscribeStore(() => {
      setTick((t) => t + 1);
    });
  }, []);
  return tick;
}

/** 'loading' until the first load for the current key finishes; 'error' if it failed. */
export type LoadStatus = 'loading' | 'ready' | 'error';

export interface StoreLoad {
  status: LoadStatus;
  /** Load again (the error state's Retry button). */
  retry: () => void;
}

/**
 * Run `reload` when the store notifies, when `readyKey` changes (e.g. league id: shows
 * loading again), or when `refreshKey` changes (e.g. a bigger page: keeps what is shown).
 * `reload` is held in a ref so unstable callback identities cannot cause update loops.
 *
 * Returns the first load's status, so a screen can show loading and error-with-retry states
 * instead of an "empty" message before its data is in. Later reloads (store changes) never
 * flip a loaded screen back to loading; a failed later reload keeps the data on screen and
 * is only logged.
 */
export function useStoreReload(
  reload: () => void | Promise<void>,
  readyKey?: string | null,
  refreshKey?: string | number,
): StoreLoad {
  const tick = useStoreTick();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  // Only the latest run may set the status, so a slow earlier load cannot overwrite it.
  const runId = useRef(0);
  const loadedKey = useRef<string | null | undefined>(undefined);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedKey.current !== readyKey) {
      loadedKey.current = readyKey;
      loadedOnce.current = false;
      setStatus('loading');
    }
    const id = ++runId.current;
    Promise.resolve()
      .then(() => reloadRef.current())
      .then(
        () => {
          if (id === runId.current) {
            loadedOnce.current = true;
            setStatus('ready');
          }
        },
        (error: unknown) => {
          logger.error('use-store-reload', 'Screen reload failed', {
            shape: error instanceof Error ? error.name : 'unknown',
            message: error instanceof Error ? error.message : undefined,
          });
          if (id === runId.current && !loadedOnce.current) {
            setStatus('error');
          }
        },
      );
  }, [tick, readyKey, refreshKey, attempt]);

  const retry = useCallback((): void => {
    setStatus('loading');
    setAttempt((a) => a + 1);
  }, []);

  return { status, retry };
}
