import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppDataStore, Match } from '@/shared/types/domain';

/**
 * On-disk layout of the local store (v3).
 *
 * On Android a single value much over ~2MB can't be read back, and match shot logs grow
 * without bound, so the store is split:
 * - one key for small session fields (`meta`),
 * - one key per collection (players, races, ...),
 * - one key per match, plus an index of match ids.
 * Only the parts that changed are serialized and written on each save.
 *
 * v3 started with the move from Firebase to the Snookit API, as a blank start (decision D8):
 * data saved under the older `snooker.v1.` / `snooker.v2.` keys by the Firebase builds is
 * ignored, not migrated, and left untouched on disk.
 */

const PREFIX = 'snooker.v3.';
const META_KEY = `${PREFIX}meta`;
const MATCH_INDEX_KEY = `${PREFIX}matchIndex`;
const MATCH_KEY_PREFIX = `${PREFIX}match.`;
export const STORE_VERSION = 3;

/** Collections stored as one key each. Matches are stored per match instead. */
const COLLECTIONS = [
  'leagues',
  'players',
  'races',
  'events',
  'pendingOps',
  'playerProfiles',
  'challenges',
  'lookingPosts',
  'directoryListings',
  'follows',
  'serverVersions',
] as const satisfies readonly (keyof AppDataStore)[];

type CollectionName = (typeof COLLECTIONS)[number];

interface StoreMeta {
  storeVersion: number;
  user: AppDataStore['user'];
  activeLeagueId: AppDataStore['activeLeagueId'];
  syncCursor: AppDataStore['syncCursor'];
}

function collectionKey(name: CollectionName): string {
  return `${PREFIX}${name}`;
}

function matchKey(id: string): string {
  return `${MATCH_KEY_PREFIX}${id}`;
}

function metaOf(store: AppDataStore): StoreMeta {
  return {
    storeVersion: STORE_VERSION,
    user: store.user,
    activeLeagueId: store.activeLeagueId,
    syncCursor: store.syncCursor,
  };
}

/** Result of reading the disk: either data (possibly none yet) or a failure to report. */
export type DiskReadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; raw: Partial<AppDataStore> }
  | { kind: 'failed'; reason: string };

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Corrupt JSON in ${label}`);
  }
}

async function readParts(): Promise<Partial<AppDataStore> | null> {
  const metaRaw = await AsyncStorage.getItem(META_KEY);
  if (metaRaw == null) {
    return null;
  }
  const meta = parseJson(metaRaw, 'meta') as Partial<StoreMeta>;
  const indexRaw = await AsyncStorage.getItem(MATCH_INDEX_KEY);
  const matchIds = indexRaw == null ? [] : (parseJson(indexRaw, 'matchIndex') as string[]);

  const keys = [...COLLECTIONS.map(collectionKey), ...matchIds.map(matchKey)];
  const pairs = await AsyncStorage.multiGet(keys);
  const values = new Map(pairs);

  const raw: Partial<AppDataStore> = {
    user: meta.user ?? null,
    activeLeagueId: meta.activeLeagueId ?? null,
    syncCursor: meta.syncCursor ?? 0,
  };
  for (const name of COLLECTIONS) {
    const value = values.get(collectionKey(name));
    if (value != null) {
      (raw as Record<string, unknown>)[name] = parseJson(value, name);
    }
  }
  const matches: Match[] = [];
  for (const id of matchIds) {
    const value = values.get(matchKey(id));
    if (value == null) {
      // The index names a match that isn't on disk: the store is inconsistent, never guess.
      throw new Error('Match listed in index is missing on disk');
    }
    matches.push(parseJson(value, 'match') as Match);
  }
  raw.matches = matches;
  return raw;
}

/** Last serialized form of each written part, so unchanged parts are never rewritten. */
export class PersistedSnapshot {
  private parts = new Map<string, string>();
  /** Store references seen at the last save, for a cheap "did this part change" check. */
  private refs = new Map<string, unknown>();

  /**
   * Work out which keys must be written or removed for `next`.
   * Parts whose object reference is unchanged are skipped without serializing them.
   */
  diff(next: AppDataStore): { writes: [string, string][]; removes: string[] } {
    const writes: [string, string][] = [];
    const removes: string[] = [];

    /** `ref` null means "always serialize" (used for the small meta part). */
    const consider = (key: string, ref: unknown, value: () => unknown): void => {
      if (ref !== null && this.refs.get(key) === ref && this.parts.has(key)) {
        return;
      }
      const serialized = JSON.stringify(value());
      if (this.parts.get(key) !== serialized) {
        writes.push([key, serialized]);
      }
    };

    const meta = metaOf(next);
    consider(META_KEY, null, () => meta);
    for (const name of COLLECTIONS) {
      consider(collectionKey(name), next[name], () => next[name] ?? []);
    }
    const ids = next.matches.map((m) => m.id);
    consider(MATCH_INDEX_KEY, next.matches, () => ids);
    const liveKeys = new Set<string>();
    for (const match of next.matches) {
      const key = matchKey(match.id);
      liveKeys.add(key);
      consider(key, match, () => match);
    }
    for (const key of this.parts.keys()) {
      if (key.startsWith(MATCH_KEY_PREFIX) && !liveKeys.has(key)) {
        removes.push(key);
      }
    }
    return { writes, removes };
  }

  /** Record what is now on disk (call only after the write succeeded). */
  commit(next: AppDataStore, written: { writes: [string, string][]; removes: string[] }): void {
    for (const [key, value] of written.writes) {
      this.parts.set(key, value);
    }
    for (const key of written.removes) {
      this.parts.delete(key);
      this.refs.delete(key);
    }
    for (const name of COLLECTIONS) {
      this.refs.set(collectionKey(name), next[name]);
    }
    this.refs.set(MATCH_INDEX_KEY, next.matches);
    for (const match of next.matches) {
      this.refs.set(matchKey(match.id), match);
    }
  }

  /** Seed from a store that was just read from (or written to) disk. */
  seed(store: AppDataStore): void {
    const all = this.diff(store);
    this.commit(store, all);
  }

  clear(): void {
    this.parts.clear();
    this.refs.clear();
  }
}

/** Write the changed parts. Throws on failure so the caller can report it. */
export async function writeParts(changes: {
  writes: [string, string][];
  removes: string[];
}): Promise<void> {
  if (changes.writes.length > 0) {
    await AsyncStorage.multiSet(changes.writes);
  }
  if (changes.removes.length > 0) {
    await AsyncStorage.multiRemove(changes.removes);
  }
}

/**
 * Read the store from disk. Never throws: failures come back as `{ kind: 'failed' }` so the
 * caller can refuse to save over data it could not read.
 */
export async function readStoreFromDisk(): Promise<DiskReadResult> {
  try {
    const raw = await readParts();
    return raw ? { kind: 'loaded', raw } : { kind: 'empty' };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : 'unknown' };
  }
}
