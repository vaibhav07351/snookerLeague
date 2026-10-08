import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/shared/logging/logger';
import type {
  AppDataStore,
  Challenge,
  DirectoryListing,
  FeedEvent,
  FollowEdge,
  League,
  LookingPost,
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
    lookingPosts: [],
    directoryListings: [],
    follows: [],
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

/** Keep one row per key (the last one wins), repairing duplicates saved by older versions. */
function uniqueBy<T>(rows: T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(key(row), row);
  }
  return [...map.values()];
}

const byId = (row: { id: string }): string => row.id;

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
    leagues: uniqueBy(
      (raw.leagues ?? []).map((l) => withUpdatedAt(l as League)),
      byId,
    ),
    players: uniqueBy(
      (raw.players ?? []).map((p) => withUpdatedAt(p as Player)),
      byId,
    ),
    matches: uniqueBy((raw.matches ?? []) as Match[], byId),
    races: uniqueBy((raw.races ?? []) as Race[], byId),
    events: uniqueBy(
      (raw.events ?? []).map((e) => {
        const event = e as FeedEvent;
        return {
          ...event,
          updatedAt:
            typeof event.updatedAt === 'string' && event.updatedAt.length > 0
              ? event.updatedAt
              : event.createdAt,
        };
      }),
      byId,
    ),
    pendingOps: Array.isArray(raw.pendingOps) ? raw.pendingOps : [],
    playerProfiles: Array.isArray(raw.playerProfiles)
      ? uniqueBy(raw.playerProfiles as PlayerProfile[], (p) => p.uid)
      : [],
    challenges: Array.isArray(raw.challenges) ? uniqueBy(raw.challenges as Challenge[], byId) : [],
    lookingPosts: Array.isArray(raw.lookingPosts)
      ? uniqueBy(raw.lookingPosts as LookingPost[], byId)
      : [],
    directoryListings: Array.isArray(raw.directoryListings)
      ? uniqueBy(raw.directoryListings as DirectoryListing[], byId)
      : [],
    follows: Array.isArray(raw.follows) ? uniqueBy(raw.follows as FollowEdge[], byId) : [],
  };
}

let memory: AppDataStore = emptyStore();
let loaded = false;
const listeners = new Set<() => void>();

let loading: Promise<AppDataStore> | null = null;

/** Load once; concurrent first calls share one read so none can overwrite a newer update. */
export function loadStore(): Promise<AppDataStore> {
  if (loaded) {
    return Promise.resolve(memory);
  }
  loading ??= readStoreFromDisk();
  return loading;
}

async function readStoreFromDisk(): Promise<AppDataStore> {
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
