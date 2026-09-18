/**
 * Shared store subscription helper for screens.
 * Bumps a tick so read-only reloads re-run without writing the store.
 */
import { useEffect, useRef, useState } from 'react';

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

/**
 * Run `reload` when the store notifies or when `readyKey` changes (e.g. league id).
 * `reload` is held in a ref so unstable callback identities cannot cause update loops.
 */
export function useStoreReload(
  reload: () => void | Promise<void>,
  readyKey?: string | null,
): void {
  const tick = useStoreTick();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    void reloadRef.current();
  }, [tick, readyKey]);
}
