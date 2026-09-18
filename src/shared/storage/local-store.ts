import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/shared/logging/logger';
import type { AppDataStore } from '@/shared/types/domain';

const STORAGE_KEY = 'snooker.v1.store';

export function emptyStore(): AppDataStore {
  return {
    user: null,
    activeLeagueId: null,
    leagues: [],
    players: [],
    matches: [],
    races: [],
    events: [],
  };
}

let memory: AppDataStore = emptyStore();
let loaded = false;
const listeners = new Set<() => void>();

export async function loadStore(): Promise<AppDataStore> {
  if (loaded) {
    return memory;
  }
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      memory = { ...emptyStore(), ...(JSON.parse(raw) as AppDataStore) };
    }
  } catch (error) {
    logger.error('local-store', 'Failed to load store', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
  loaded = true;
  return memory;
}

export function getStore(): AppDataStore {
  return memory;
}

export async function saveStore(next: AppDataStore): Promise<void> {
  memory = next;
  listeners.forEach((l) => l());
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.error('local-store', 'Failed to persist store', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}

export async function updateStore(
  mutator: (current: AppDataStore) => AppDataStore,
): Promise<AppDataStore> {
  await loadStore();
  const next = mutator(memory);
  await saveStore(next);
  return next;
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
