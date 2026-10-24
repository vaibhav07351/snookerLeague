import { createId, nowIso } from '@/shared/utils/id';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import {
  firebaseErrorMeta,
  isNetworkError,
  isPermanentWriteError,
} from '@/shared/sync/firebase-error';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { notify } from '@/shared/ui/notify';
import { shouldCloudSync } from '@/shared/sync/firestore-paths';
import { markLeaguesInCloud } from '@/shared/sync/cloud-leagues';
import { refetchAfterRejection } from '@/shared/sync/pull';
import { pushPendingOp } from '@/shared/sync/push';
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
    dateOfBirth: user.dateOfBirth ?? null,
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

/** After a successful push: remember leagues that now exist in the cloud. */
async function afterPush(op: PendingOp): Promise<void> {
  if (op.entity === 'league' && op.action === 'upsert') {
    await markLeaguesInCloud([op.docId]);
  }
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

/** Remove a league from the cloud profile's league list (left, deleted or unreachable). */
export async function scheduleProfileLeagueRemoval(leagueId: string): Promise<void> {
  await loadStore();
  const user = getStore().user;
  if (!user || user.isDemo) {
    return;
  }
  await scheduleSync([
    {
      entity: 'user',
      docId: user.uid,
      leagueId: null,
      action: 'upsert',
      payload: { uid: user.uid },
      updatedAt: nowIso(),
      membership: { remove: leagueId },
    },
  ]);
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
      const next = getStore().pendingOps[0];
      if (!next) {
        break;
      }
      try {
        await pushPendingOp(next);
        await removePending([next.opId]);
        await afterPush(next);
        setCloudReachable(true);
      } catch (error) {
        if (isPermanentWriteError(error)) {
          // The server will never accept this write: drop it so it cannot block the queue.
          reportRejectedWrite(next, firebaseErrorMeta(error));
          await removePending([next.opId]);
          continue;
        }
        await bumpAttempts(next.opId);
        if (isNetworkError(error)) {
          setCloudReachable(false);
        }
        // Retried on the next write, reconnect or app start, not in a tight loop.
        flushAgain = false;
        const meta = firebaseErrorMeta(error);
        logger.error('sync.flush', 'Pending op failed', {
          ...meta,
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
function reportRejectedWrite(op: PendingOp, meta: ReturnType<typeof firebaseErrorMeta>): void {
  logger.error('sync.schedule', 'Write rejected by server; dropped', {
    ...meta,
    entity: op.entity,
    docId: op.docId,
    action: op.action,
  });
  // Put this phone back in step with what the server actually holds.
  void refetchAfterRejection(op);
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
