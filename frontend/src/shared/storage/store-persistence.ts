import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppDataStore } from '@/shared/types/domain';

/**
 * On-disk layout of the local store (v3).
 *
 * On Android a single value much over ~2MB can't be read back, and match shot logs grow
 * without bound, so the store is split:
 * - one key for small session fields (`meta`),
 * - one key per collection (players, races, ...),
 * - one key per match (and per free-for-all match), plus an index of ids for each.
 * Only the parts that changed are serialized and written on each save.
 *
 * v3 started with the move from Firebase to the Snookit API, as a blank start (decision D8):
 * data saved under the older `snooker.v1.` / `snooker.v2.` keys by the Firebase builds is
 * ignored, not migrated, and left untouched on disk.
 */

const PREFIX = 'snooker.v3.';
const META_KEY = `${PREFIX}meta`;
export const STORE_VERSION = 3;

/**
 * Collections whose documents carry growing shot logs: stored one key per document plus an
 * index of ids, so no single value gets too big to read back.
 */
const PER_DOC_COLLECTIONS = [
  { name: 'matches', indexKey: `${PREFIX}matchIndex`, keyPrefix: `${PREFIX}match.` },
  { name: 'groupMatches', indexKey: `${PREFIX}groupMatchIndex`, keyPrefix: `${PREFIX}groupMatch.` },
] as const satisfies readonly {
  name: keyof AppDataStore;
  indexKey: string;
  keyPrefix: string;
}[];

type PerDocCollection = (typeof PER_DOC_COLLECTIONS)[number];

/** Collections stored as one key each. Per-document collections are listed above instead. */
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
  'tournaments',
  'serverVersions',
] as const satisfies readonly (keyof AppDataStore)[];

type CollectionName = (typeof COLLECTIONS)[number];

interface StoreMeta {
  storeVersion: number;
  user: AppDataStore['user'];
  activeLeagueId: AppDataStore['activeLeagueId'];
  syncCursor: AppDataStore['syncCursor'];
  pullKindsVersion?: AppDataStore['pullKindsVersion'];
}

function collectionKey(name: CollectionName): string {
  return `${PREFIX}${name}`;
}

function docKey(collection: PerDocCollection, id: string): string {
  return `${collection.keyPrefix}${id}`;
}

function metaOf(store: AppDataStore): StoreMeta {
  return {
    storeVersion: STORE_VERSION,
    user: store.user,
    activeLeagueId: store.activeLeagueId,
    syncCursor: store.syncCursor,
    pullKindsVersion: store.pullKindsVersion,
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
  const indexPairs = await AsyncStorage.multiGet(PER_DOC_COLLECTIONS.map((c) => c.indexKey));
  const indexes = new Map(indexPairs);
  const idsByCollection = PER_DOC_COLLECTIONS.map((collection) => {
    const indexRaw = indexes.get(collection.indexKey);
    const ids = indexRaw == null ? [] : (parseJson(indexRaw, collection.indexKey) as string[]);
    return { collection, ids };
  });

  const keys = [
    ...COLLECTIONS.map(collectionKey),
    ...idsByCollection.flatMap(({ collection, ids }) => ids.map((id) => docKey(collection, id))),
  ];
  const pairs = await AsyncStorage.multiGet(keys);
  const values = new Map(pairs);

  const raw: Partial<AppDataStore> = {
    user: meta.user ?? null,
    activeLeagueId: meta.activeLeagueId ?? null,
    syncCursor: meta.syncCursor ?? 0,
    pullKindsVersion: meta.pullKindsVersion ?? 0,
  };
  for (const name of COLLECTIONS) {
    const value = values.get(collectionKey(name));
    if (value != null) {
      (raw as Record<string, unknown>)[name] = parseJson(value, name);
    }
  }
  for (const { collection, ids } of idsByCollection) {
    const docs: unknown[] = [];
    for (const id of ids) {
      const value = values.get(docKey(collection, id));
      if (value == null) {
        // The index names a document that isn't on disk: the store is inconsistent, never guess.
        throw new Error(`Document listed in ${collection.indexKey} is missing on disk`);
      }
      docs.push(parseJson(value, collection.name));
    }
    (raw as Record<string, unknown>)[collection.name] = docs;
  }
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
    for (const collection of PER_DOC_COLLECTIONS) {
      const docs: readonly { id: string }[] = next[collection.name] ?? [];
      consider(collection.indexKey, docs, () => docs.map((d) => d.id));
      const liveKeys = new Set<string>();
      for (const doc of docs) {
        const key = docKey(collection, doc.id);
        liveKeys.add(key);
        consider(key, doc, () => doc);
      }
      for (const key of this.parts.keys()) {
        if (key.startsWith(collection.keyPrefix) && !liveKeys.has(key)) {
          removes.push(key);
        }
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
    for (const collection of PER_DOC_COLLECTIONS) {
      const docs: readonly { id: string }[] = next[collection.name] ?? [];
      this.refs.set(collection.indexKey, docs);
      for (const doc of docs) {
        this.refs.set(docKey(collection, doc.id), doc);
      }
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
