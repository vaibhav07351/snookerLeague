import { useCallback, useEffect, useState } from 'react';

import { logger } from '@/shared/logging/logger';
import { getStore, subscribeStore } from '@/shared/storage/local-store';
import { flushPending } from '@/shared/sync/schedule';
import { syncErrorMeta } from '@/shared/sync/sync-errors';
import {
  discardParkedWrites,
  parkedWritesOf,
  retryParkedWrites,
  waitingWritesOf,
} from '@/shared/sync/parked';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';

export interface ParkedWritesState {
  /** Changes this account has that the server refused or could not save. */
  count: number;
  /** Changes still queued to send (they go up on their own when the server is reachable). */
  waiting: number;
  busy: boolean;
  /** Send the waiting changes now instead of after the backoff. */
  syncNow: () => Promise<void>;
  retry: () => Promise<void>;
  /** Asks first, then puts the online version back on this phone. */
  discard: () => Promise<void>;
}

/** Set-aside sync writes for the signed-in account, with the user's two ways out. */
export function useParkedWrites(): ParkedWritesState {
  const [count, setCount] = useState(() => parkedWritesOf(getStore()).length);
  const [waiting, setWaiting] = useState(() => waitingWritesOf(getStore()).length);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      subscribeStore(() => {
        const store = getStore();
        setCount(parkedWritesOf(store).length);
        setWaiting(waitingWritesOf(store).length);
      }),
    [],
  );

  const syncNow = useCallback(async () => {
    setBusy(true);
    try {
      await flushPending({ force: true });
    } catch (error) {
      logger.error('use-parked-writes', 'Sync now failed', syncErrorMeta(error));
      notify.error('Could not sync', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setBusy(true);
    try {
      await retryParkedWrites();
    } catch (error) {
      logger.error('use-parked-writes', 'Retry failed', syncErrorMeta(error));
      notify.error('Could not retry', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  const discard = useCallback(async () => {
    const n = parkedWritesOf(getStore()).length;
    const ok = await confirmAction(
      n === 1 ? 'Discard this change?' : `Discard ${n} changes?`,
      'This phone goes back to the version saved online. This cannot be undone.',
      'Discard',
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      await discardParkedWrites();
    } catch (error) {
      logger.error('use-parked-writes', 'Discard failed', syncErrorMeta(error));
      notify.error('Could not discard', 'Connect to the internet and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { count, waiting, busy, syncNow, retry, discard };
}
