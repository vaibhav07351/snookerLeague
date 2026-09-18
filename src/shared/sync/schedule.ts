import { createId, nowIso } from '@/shared/utils/id';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import { shouldCloudSync } from '@/shared/sync/firestore-paths';
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
      league: 1,
      user: 2,
    };
    return deleteOrder[op.entity] ?? 9;
  }
  const upsertOrder: Record<SyncEntity, number> = {
    user: 0,
    league: 1,
    player: 2,
    match: 2,
    race: 2,
    event: 2,
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
  };
}

async function enqueue(ops: PendingOp[]): Promise<void> {
  if (ops.length === 0) {
    return;
  }
  await updateStore((s) => {
    const withoutDupes = s.pendingOps.filter(
      (existing) =>
        !ops.some(
          (op) =>
            op.entity === existing.entity &&
            op.docId === existing.docId &&
            op.action === existing.action,
        ),
    );
    const nextOps = sortPendingOps([...withoutDupes, ...ops]);
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

/**
 * After a local write: push immediately if online, else queue.
 * No-op for demo users / local-only mode.
 */
export async function scheduleSync(items: ScheduleItem[]): Promise<void> {
  await loadStore();
  const user = getStore().user;
  if (!shouldCloudSync(user)) {
    // Keep offline queue when we have a Google user but Auth token isn't ready yet.
    if (user && !user.isDemo) {
      const ops: PendingOp[] = sortPendingOps(
        items.map((item) => ({
          opId: createId('op'),
          entity: item.entity,
          docId: item.docId,
          leagueId: item.leagueId,
          action: item.action,
          payload: item.payload,
          updatedAt: item.updatedAt ?? nowIso(),
          attempts: 0,
        })),
      );
      await enqueue(ops);
    }
    return;
  }

  const ops: PendingOp[] = sortPendingOps(
    items.map((item) => ({
      opId: createId('op'),
      entity: item.entity,
      docId: item.docId,
      leagueId: item.leagueId,
      action: item.action,
      payload: item.payload,
      updatedAt: item.updatedAt ?? nowIso(),
      attempts: 0,
    })),
  );

  if (!isOnline()) {
    await enqueue(ops);
    return;
  }

  const failed: PendingOp[] = [];
  for (const op of ops) {
    try {
      await pushPendingOp(op);
    } catch (error) {
      const meta = firebaseErrorMeta(error);
      logger.error('sync.schedule', 'Push failed; queuing', {
        ...meta,
        entity: op.entity,
        docId: op.docId,
      });
      failed.push(op);
    }
  }
  if (failed.length > 0) {
    await enqueue(failed);
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

export async function flushPending(): Promise<void> {
  if (flushing) {
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
      } catch (error) {
        await bumpAttempts(next.opId);
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
}

export { buildCloudUserPayload };
