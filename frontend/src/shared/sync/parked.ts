import { ApiError } from '@/shared/api/client';
import type { ServerDoc } from '@/shared/api/sync-api';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { applyServerDocs } from '@/shared/sync/apply';
import { dropUnreachableLeague } from '@/shared/sync/cloud-leagues';
import { fetchLeagueHistory } from '@/shared/sync/pull';
import { flushPending } from '@/shared/sync/schedule';
import type { AppDataStore, PendingOp } from '@/shared/types/domain';

/**
 * Writes the queue set aside (the server refused them, or they kept failing). They stay on
 * this phone until the user retries or discards them: a change is never thrown away silently.
 */

/** League documents, whose server copy can be fetched back on discard. */
const LEAGUE_DOC_KINDS: ReadonlySet<string> = new Set([
  'league',
  'player',
  'match',
  'race',
  'group_match',
  'event',
  'tournament',
]);

/** The signed-in account's set-aside writes. */
export function parkedWritesOf(store: AppDataStore): PendingOp[] {
  const uid = store.user?.uid;
  if (!uid) {
    return [];
  }
  return store.pendingOps.filter((op) => op.parked && (op.uid === undefined || op.uid === uid));
}

/** The signed-in account's writes still queued to send (not set aside). */
export function waitingWritesOf(store: AppDataStore): PendingOp[] {
  const uid = store.user?.uid;
  if (!uid) {
    return [];
  }
  return store.pendingOps.filter((op) => !op.parked && (op.uid === undefined || op.uid === uid));
}

function unparked(op: PendingOp): PendingOp {
  const next: PendingOp = { ...op, attempts: 0 };
  delete next.parked;
  delete next.failures;
  return next;
}

/** Put the set-aside writes back in the queue and send them now. */
export async function retryParkedWrites(): Promise<void> {
  await loadStore();
  const ids = new Set(parkedWritesOf(getStore()).map((op) => op.opId));
  if (ids.size === 0) {
    return;
  }
  logger.info('sync.parked', 'Retrying set-aside writes', { count: ids.size });
  await updateStore((s) => ({
    ...s,
    pendingOps: s.pendingOps.map((op) => (ids.has(op.opId) ? unparked(op) : op)),
  }));
  await flushPending({ force: true });
}

/** League id -> ids of its documents with a set-aside write. */
function leagueDocsOf(ops: PendingOp[]): Map<string, Set<string>> {
  const byLeague = new Map<string, Set<string>>();
  for (const op of ops) {
    if (!LEAGUE_DOC_KINDS.has(op.entity)) {
      continue;
    }
    const leagueId = op.entity === 'league' ? op.docId : op.leagueId;
    if (!leagueId) {
      continue;
    }
    const ids = byLeague.get(leagueId) ?? new Set<string>();
    ids.add(op.docId);
    byLeague.set(leagueId, ids);
  }
  return byLeague;
}

/**
 * Throw the set-aside writes away and put the server's copy of each document back on this
 * phone (removing it when the server never had it). The server copies are fetched first, so
 * if that fails (for example offline) the error is thrown and nothing on this phone changes.
 */
export async function discardParkedWrites(): Promise<void> {
  await loadStore();
  const parked = parkedWritesOf(getStore());
  if (parked.length === 0) {
    return;
  }
  const opIds = new Set(parked.map((op) => op.opId));
  const docs: ServerDoc[] = [];
  const replaceIds = new Set<string>();
  const unreachable: string[] = [];
  for (const [leagueId, ids] of leagueDocsOf(parked)) {
    try {
      docs.push(...(await fetchLeagueHistory(leagueId)));
      ids.forEach((id) => replaceIds.add(id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        unreachable.push(leagueId); // no longer a member: the whole league goes
        continue;
      }
      throw error;
    }
  }
  await applyServerDocs(docs, {
    replaceIds,
    alsoChange: (s) => ({ ...s, pendingOps: s.pendingOps.filter((op) => !opIds.has(op.opId)) }),
  });
  for (const leagueId of unreachable) {
    await dropUnreachableLeague(leagueId);
  }
  logger.info('sync.parked', 'Discarded set-aside writes', {
    count: opIds.size,
    restored: replaceIds.size,
  });
}
