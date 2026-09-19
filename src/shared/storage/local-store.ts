import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/shared/logging/logger';
import type {
  AppDataStore,
  Challenge,
  FeedEvent,
  League,
  Match,
  Player,
  PlayerProfile,
  Race,
} from '@/shared/types/domain';

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
    pendingOps: [],
    playerProfiles: [],
    challenges: [],
  };
}

function withUpdatedAt<T extends { createdAt: string; updatedAt?: string }>(
  row: T,
): T & {
  updatedAt: string;
} {
  return {
    ...row,
    updatedAt:
      typeof row.updatedAt === 'string' && row.updatedAt.length > 0 ? row.updatedAt : row.createdAt,
  };
}

/** Normalize older AsyncStorage blobs missing sync fields. */
export function normalizeStore(raw: Partial<AppDataStore>): AppDataStore {
  const base = emptyStore();
  return {
    ...base,
    ...raw,
    user: raw.user
      ? {
          ...raw.user,
          cityId: raw.user.cityId ?? null,
          cityName: raw.user.cityName ?? null,
        }
      : null,
    leagues: (raw.leagues ?? []).map((l) => withUpdatedAt(l as League)),
    players: (raw.players ?? []).map((p) => withUpdatedAt(p as Player)),
    matches: (raw.matches ?? []) as Match[],
    races: (raw.races ?? []) as Race[],
    events: (raw.events ?? []).map((e) => {
      const event = e as FeedEvent;
      return {
        ...event,
        updatedAt:
          typeof event.updatedAt === 'string' && event.updatedAt.length > 0
            ? event.updatedAt
            : event.createdAt,
      };
    }),
    pendingOps: Array.isArray(raw.pendingOps) ? raw.pendingOps : [],
    playerProfiles: Array.isArray(raw.playerProfiles)
      ? (raw.playerProfiles as PlayerProfile[])
      : [],
    challenges: Array.isArray(raw.challenges) ? (raw.challenges as Challenge[]) : [],
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
      memory = normalizeStore(JSON.parse(raw) as Partial<AppDataStore>);
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
  // Prevent subscribe → reload → write loops when mutators return unchanged data.
  if (next === memory || JSON.stringify(next) === JSON.stringify(memory)) {
    return memory;
  }
  await saveStore(next);
  return next;
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
