import { AppState } from 'react-native';

import { logger } from '@/shared/logging/logger';
import { getStore } from '@/shared/storage/local-store';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import { isOnline } from '@/shared/sync/connectivity';
import { pullChanges } from '@/shared/sync/pull';
import { flushPending } from '@/shared/sync/schedule';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { isNetworkError, syncErrorMeta } from '@/shared/sync/sync-errors';

/**
 * How often an open app asks the server for changes. Watchers of a live match see shots
 * within this delay. (A WebSocket for live matches is planned; see the production plan.)
 */
const POLL_MS = 10_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking || AppState.currentState !== 'active' || !isOnline()) {
    return;
  }
  if (!shouldCloudSync(getStore().user)) {
    stopWatchingActiveLeague();
    return;
  }
  ticking = true;
  try {
    await flushPending();
    await pullChanges();
    setCloudReachable(true);
  } catch (error) {
    if (isNetworkError(error)) {
      setCloudReachable(false);
    }
    logger.warn('sync.watch', 'Background pull failed', syncErrorMeta(error));
  } finally {
    ticking = false;
  }
}

/**
 * Keep this phone up to date while the app is open: every league the user belongs to is
 * pulled, so the league id only matters for when polling should run at all. Safe to call
 * repeatedly.
 */
export function watchActiveLeague(_leagueId: string | null): void {
  if (!shouldCloudSync(getStore().user) || !isOnline()) {
    stopWatchingActiveLeague();
    return;
  }
  if (timer) {
    return;
  }
  timer = setInterval(() => void tick(), POLL_MS);
}

export function stopWatchingActiveLeague(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
