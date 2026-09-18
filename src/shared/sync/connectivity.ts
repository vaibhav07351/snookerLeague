import { getNetworkStateAsync, addNetworkStateListener } from 'expo-network';
import { Platform } from 'react-native';

import { logger } from '@/shared/logging/logger';

type Listener = (online: boolean) => void;

let cachedOnline = true;
const listeners = new Set<Listener>();
let started = false;
let removeNative: { remove: () => void } | null = null;

function setOnline(next: boolean): void {
  if (cachedOnline === next) {
    return;
  }
  cachedOnline = next;
  listeners.forEach((l) => l(next));
}

async function refreshFromExpo(): Promise<void> {
  try {
    const state = await getNetworkStateAsync();
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    setOnline(online);
  } catch (error) {
    logger.error('connectivity', 'Failed to read network state', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}

function onBrowserOnline(): void {
  setOnline(true);
}

function onBrowserOffline(): void {
  setOnline(false);
}

/** Start listening for online/offline. Idempotent. */
export function startConnectivity(): void {
  if (started) {
    return;
  }
  started = true;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    window.addEventListener('online', onBrowserOnline);
    window.addEventListener('offline', onBrowserOffline);
  }

  void refreshFromExpo();
  removeNative = addNetworkStateListener((state) => {
    const online = state.isConnected !== false && state.isInternetReachable !== false;
    setOnline(online);
  });
}

export function stopConnectivity(): void {
  if (!started) {
    return;
  }
  started = false;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.removeEventListener('online', onBrowserOnline);
    window.removeEventListener('offline', onBrowserOffline);
  }
  removeNative?.remove();
  removeNative = null;
}

export function isOnline(): boolean {
  return cachedOnline;
}

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
