import { createId, nowIso } from '@/shared/utils/id';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { isNetworkError, isPermanentWriteError, syncErrorMeta } from '@/shared/sync/sync-errors';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { notify } from '@/shared/ui/notify';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import { isBatchable, pushDocBatch, pushSingle, type PushOutcome } from '@/shared/sync/push';
import type {
  CloudUserProfile,
  PendingOp,
  SessionUser,
  SyncAction,
  SyncEntity,
} from '@/shared/types/domain';

export interface ScheduleItem {
  entity: SyncEntity;
  docId: string;
  leagueId: string | null;
  action: SyncAction;
  payload: unknown | null;
  updatedAt?: string;
  fieldsOnly?: string[];
  membership?: { add?: string; remove?: string };
}

let flushing = false;

/** Upserts: user → league → children. Deletes: children → league → user. */
function syncPriority(op: PendingOp): number {
  if (op.action === 'delete') {
    const deleteOrder: Record<SyncEntity, number> = {
      player: 0,
      match: 0,
      race: 0,
      event: 0,
      challenge: 0,
      looking: 0,
      directory: 0,
      follow: 0,
      profile: 0,
      invite: 0,
      block: 0,
      report: 0,
      device: 0,
      tournament: 0,
      league: 1,
      user: 2,
    };
    return deleteOrder[op.entity] ?? 9;
  }
  const upsertOrder: Record<SyncEntity, number> = {
    user: 0,
    profile: 0,
    league: 1,
    player: 2,
    match: 2,
    race: 2,
    event: 2,
    challenge: 2,
    looking: 2,
    directory: 2,
    follow: 2,
    invite: 2,
    block: 2,
    report: 2,
    device: 2,
    tournament: 2,
  };
  return upsertOrder[op.entity] ?? 9;
}

function sortPendingOps(ops: PendingOp[]): PendingOp[] {
  return [...ops].sort((a, b) => {
    const byPri = syncPriority(a) - syncPriority(b);
    if (byPri !== 0) {
      return byPri;
    }
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

function buildCloudUserPayload(user: SessionUser, store = getStore()): CloudUserProfile {
  const leagueIds = store.leagues.filter((l) => l.memberUids.includes(user.uid)).map((l) => l.id);
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoUrl: user.photoUrl,
    leagueIds,
    activeLeagueId: store.activeLeagueId,
    updatedAt: nowIso(),
    cityId: user.cityId,
    cityName: user.cityName,
    // D5: the date of birth never leaves the phone.
    dateOfBirth: null,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
  };
}

function sameDoc(a: PendingOp, b: PendingOp): boolean {
  return a.entity === b.entity && a.docId === b.docId;
}

function isFullUpsert(op: PendingOp): boolean {
  return op.action === 'upsert' && !op.fieldsOnly && !op.membership;
}

/**
 * Queue ops, keeping at most one full write per document: a newer save replaces an older
 * queued save, and a delete replaces everything queued for that document (so a stale save
 * can never bring a deleted document back). Field-only and membership ops are kept.
 */
async function enqueue(ops: PendingOp[]): Promise<void> {
  if (ops.length === 0) {
    return;
  }
  await updateStore((s) => {
    let queue = s.pendingOps;
    for (const op of ops) {
      queue = queue.filter((existing) => {
        if (!sameDoc(existing, op)) {
          return true;
        }
        if (op.action === 'delete') {
          return false;
        }
        return !(isFullUpsert(op) && isFullUpsert(existing));
      });
      queue = [...queue, op];
    }
    const nextOps = sortPendingOps(queue);
    if (JSON.stringify(nextOps) === JSON.stringify(s.pendingOps)) {
      return s;
    }
    return { ...s, pendingOps: nextOps };
  });
}

async function removePending(opIds: string[]): Promise<void> {
  if (opIds.length === 0) {
    return;
  }
  const idSet = new Set(opIds);
  await updateStore((s) => ({
    ...s,
    pendingOps: s.pendingOps.filter((op) => !idSet.has(op.opId)),
  }));
}

async function bumpAttempts(opId: string): Promise<void> {
  await updateStore((s) => ({
    ...s,
    pendingOps: s.pendingOps.map((op) =>
      op.opId === opId ? { ...op, attempts: op.attempts + 1 } : op,
    ),
  }));
}

function toOp(item: ScheduleItem): PendingOp {
  return {
    opId: createId('op'),
    entity: item.entity,
    docId: item.docId,
    leagueId: item.leagueId,
    action: item.action,
    payload: item.payload,
    updatedAt: item.updatedAt ?? nowIso(),
    attempts: 0,
    ...(item.fieldsOnly ? { fieldsOnly: item.fieldsOnly } : {}),
    ...(item.membership ? { membership: item.membership } : {}),
  };
}

/**
 * After a local write: push immediately if online, else queue.
 * A document that still has queued writes goes through the queue too, so writes for one
 * document always reach the server in order. No-op for demo users / local-only mode.
 */
export async function scheduleSync(items: ScheduleItem[]): Promise<void> {
  await loadStore();
  const user = getStore().user;
  const ops = sortPendingOps(items.map(toOp));
  if (!shouldCloudSync(user)) {
    // Keep offline queue when we have a Google user but Auth token isn't ready yet.
    if (user && !user.isDemo) {
      await enqueue(ops);
    }
    return;
  }

  // One ordered queue for every write: the caller never waits on the network, writes for
  // a document always land in order, and a newer save replaces an older queued one.
  await enqueue(ops);
  if (isOnline()) {
    void flushPending();
  }
}

/** Convenience: sync current cloud user profile from local membership. */
export async function scheduleUserProfileSync(): Promise<void> {
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user) || !user) {
    return;
  }
  const payload = buildCloudUserPayload(user);
  await scheduleSync([
    {
      entity: 'user',
      docId: user.uid,
      leagueId: null,
      action: 'upsert',
      payload,
      updatedAt: payload.updatedAt,
    },
  ]);
}

let flushAgain = false;

/** Writes per batched push (the server accepts up to 100). */
const MAX_BATCH = 50;
/** A write that keeps meeting newer server copies is given up after this many tries. */
const MAX_ATTEMPTS = 5;

/**
 * The next writes to send together: consecutive plain league-document writes, each for a
 * different document (a second write for the same document must wait for the first's
 * new version).
 */
function takeBatch(queue: PendingOp[]): PendingOp[] {
  const first = queue[0];
  if (!first || !isBatchable(first)) {
    return first ? [first] : [];
  }
  const batch: PendingOp[] = [];
  const docs = new Set<string>();
  for (const op of queue) {
    const key = `${op.entity}:${op.docId}`;
    if (!isBatchable(op) || docs.has(key) || batch.length >= MAX_BATCH) {
      break;
    }
    docs.add(key);
    batch.push(op);
  }
  return batch;
}

async function settle(batch: PendingOp[], outcomes: PushOutcome[]): Promise<void> {
  const done: string[] = [];
  for (const [i, op] of batch.entries()) {
    const outcome = outcomes[i];
    if (!outcome) {
      continue;
    }
    switch (outcome.status) {
      case 'applied':
      case 'resolved':
        done.push(op.opId);
        break;
      case 'rejected':
        reportRejectedWrite(op, syncErrorMeta(outcome.error));
        done.push(op.opId);
        break;
      case 'retry':
        if (op.attempts + 1 >= MAX_ATTEMPTS) {
          logger.error('sync.flush', 'Write kept conflicting; dropped', {
            entity: op.entity,
            docId: op.docId,
          });
          done.push(op.opId);
          break;
        }
        await updateStore((s) => ({
          ...s,
          pendingOps: s.pendingOps.map((p) =>
            p.opId === op.opId
              ? {
                  ...p,
                  attempts: p.attempts + 1,
                  ...(outcome.payload !== undefined ? { payload: outcome.payload } : {}),
                }
              : p,
          ),
        }));
        break;
    }
  }
  await removePending(done);
}

export async function flushPending(): Promise<void> {
  if (flushing) {
    // A pass is running; make sure it looks at the queue once more before it stops.
    flushAgain = true;
    return;
  }
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user) || !isOnline()) {
    return;
  }

  flushing = true;
  try {
    for (;;) {
      await updateStore((s) => ({ ...s, pendingOps: sortPendingOps(s.pendingOps) }));
      const batch = takeBatch(getStore().pendingOps);
      const next = batch[0];
      if (!next) {
        break;
      }
      try {
        const outcomes = isBatchable(next) ? await pushDocBatch(batch) : [await pushSingle(next)];
        await settle(batch, outcomes);
        setCloudReachable(true);
      } catch (error) {
        if (isPermanentWriteError(error)) {
          // The server will never accept this write: drop it so it cannot block the queue.
          reportRejectedWrite(next, syncErrorMeta(error));
          await removePending([next.opId]);
          continue;
        }
        await bumpAttempts(next.opId);
        if (isNetworkError(error)) {
          setCloudReachable(false);
        }
        // Retried on the next write, reconnect or app start, not in a tight loop.
        flushAgain = false;
        logger.error('sync.flush', 'Pending op failed', {
          ...syncErrorMeta(error),
          entity: next.entity,
          docId: next.docId,
          attempts: next.attempts + 1,
        });
        break;
      }
    }
  } finally {
    flushing = false;
  }
  if (flushAgain) {
    flushAgain = false;
    void flushPending();
  }
}

let lastRejectNoticeAt = 0;

/** Log a write the server refused, and tell the user once in a while (not per document). */
function reportRejectedWrite(op: PendingOp, meta: ReturnType<typeof syncErrorMeta>): void {
  logger.error('sync.schedule', 'Write rejected by server; dropped', {
    ...meta,
    entity: op.entity,
    docId: op.docId,
    action: op.action,
  });
  const now = Date.now();
  if (now - lastRejectNoticeAt > 60_000) {
    lastRejectNoticeAt = now;
    notify.error(
      'A change was not saved online',
      'You may not have permission for it (for example, someone else is scoring). It stays on this phone only.',
    );
  }
}

export { buildCloudUserPayload };
