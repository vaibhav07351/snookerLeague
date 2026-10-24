import { logger } from '@/shared/logging/logger';
import {
  PersistedSnapshot,
  readStoreFromDisk,
  writeParts,
  type DiskReadResult,
} from '@/shared/storage/store-persistence';
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
const persisted = new PersistedSnapshot();

/**
 * True when the disk could not be read. The app keeps working in memory, but nothing is
 * written, so a failed read can never be followed by overwriting the real data on disk.
 */
let readOnly = false;

let loading: Promise<AppDataStore> | null = null;

/** Load once; concurrent first calls share one read so none can overwrite a newer update. */
export function loadStore(): Promise<AppDataStore> {
  if (loaded) {
    return Promise.resolve(memory);
  }
  loading ??= loadFromDisk();
  return loading;
}

const LOAD_ATTEMPTS = 2;

async function loadFromDisk(): Promise<AppDataStore> {
  let result: DiskReadResult = { kind: 'failed', reason: 'not attempted' };
  for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt += 1) {
    result = await readStoreFromDisk(normalizeStore);
    if (result.kind !== 'failed') {
      break;
    }
  }
  if (result.kind === 'failed') {
    readOnly = true;
    logger.error('local-store', 'Failed to load store; saving is disabled for this session', {
      reason: result.reason,
    });
  } else if (result.kind === 'loaded') {
    memory = normalizeStore(result.raw);
    persisted.seed(memory);
    if (result.migratedFromV1) {
      logger.info('local-store', 'Migrated store to per-key layout', {
        matches: memory.matches.length,
      });
    }
  }
  loaded = true;
  return memory;
}

/** Whether saving is disabled because the stored data could not be read. */
export function isStoreReadOnly(): boolean {
  return readOnly;
}

export function getStore(): AppDataStore {
  return memory;
}

async function persist(next: AppDataStore): Promise<void> {
  if (readOnly) {
    return;
  }
  const changes = persisted.diff(next);
  if (changes.writes.length === 0 && changes.removes.length === 0) {
    return;
  }
  try {
    await writeParts(changes);
    persisted.commit(next, changes);
  } catch (error) {
    // Not committed, so the same parts are retried on the next save.
    logger.error('local-store', 'Failed to persist store', {
      shape: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown',
      keys: changes.writes.length,
    });
  }
}

export async function saveStore(next: AppDataStore): Promise<void> {
  memory = next;
  listeners.forEach((l) => l());
  await persist(next);
}

/**
 * Apply a change. Only the parts of the store whose references changed are compared and
 * written, so a shot in one match never re-serializes every other match.
 */
export async function updateStore(
  mutator: (current: AppDataStore) => AppDataStore,
): Promise<AppDataStore> {
  await loadStore();
  const next = mutator(memory);
  // Prevent subscribe -> reload -> write loops when mutators return unchanged data.
  if (next === memory || !hasChanged(memory, next)) {
    return memory;
  }
  await saveStore(next);
  return next;
}

/** Cheap structural check: references first, serializing only parts that were replaced. */
function hasChanged(prev: AppDataStore, next: AppDataStore): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof AppDataStore>;
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (a === b) {
      continue;
    }
    if (key === 'matches' && Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return true;
      }
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i] && JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
          return true;
        }
      }
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      return true;
    }
  }
  return false;
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
