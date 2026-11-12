import { ApiError } from '@/shared/api/client';
import { createId, nowIso } from '@/shared/utils/id';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import {
  isNetworkError,
  isPermanentWriteError,
  isTransientError,
  RejectedWriteError,
  syncErrorMeta,
} from '@/shared/sync/sync-errors';
import { setCloudReachable } from '@/shared/sync/sync-status';
import { notify } from '@/shared/ui/notify';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import {
  isBatchable,
  pushDocBatch,
  pushSingle,
  wireSize,
  type PushOutcome,
} from '@/shared/sync/push';
import type {
  CloudUserProfile,
  ParkedWrite,
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
      group_match: 0,
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
    group_match: 2,
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
    // Private settings only (never the public profile). Null leaves the saved date alone.
    dateOfBirth: user.dateOfBirth ?? null,
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

async function updatePending(opIds: string[], change: (op: PendingOp) => PendingOp): Promise<void> {
  if (opIds.length === 0) {
    return;
  }
  const idSet = new Set(opIds);
  await updateStore((s) => ({
    ...s,
    pendingOps: s.pendingOps.map((op) => (idSet.has(op.opId) ? change(op) : op)),
  }));
}

function toOp(item: ScheduleItem, uid: string | undefined): PendingOp {
  return {
    opId: createId('op'),
    entity: item.entity,
    docId: item.docId,
    leagueId: item.leagueId,
    action: item.action,
    payload: item.payload,
    updatedAt: item.updatedAt ?? nowIso(),
    attempts: 0,
    ...(uid ? { uid } : {}),
    ...(item.fieldsOnly ? { fieldsOnly: item.fieldsOnly } : {}),
    ...(item.membership ? { membership: item.membership } : {}),
  };
}

/**
 * Give queued writes from builds that did not record an account to `uid` (call on sign-out,
 * so the next account on this phone never sends them). Pure; callers save the result.
 */
export function tagQueuedWrites(ops: PendingOp[], uid: string): PendingOp[] {
  return ops.some((op) => op.uid === undefined)
    ? ops.map((op) => (op.uid === undefined ? { ...op, uid } : op))
    : ops;
}

/** Whether this account's session may send the write now (set-aside writes wait for the user). */
export function isSendable(op: PendingOp, uid: string): boolean {
  return !op.parked && (op.uid === undefined || op.uid === uid);
}

/**
 * After a local write: push immediately if online, else queue.
 * A document that still has queued writes goes through the queue too, so writes for one
 * document always reach the server in order. No-op for demo users / local-only mode.
 */
export async function scheduleSync(items: ScheduleItem[]): Promise<void> {
  await loadStore();
  const user = getStore().user;
  const ops = sortPendingOps(items.map((item) => toOp(item, user?.uid)));
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
/**
 * JSON characters per batched push. The server refuses bodies over 1 MB; names in other
 * scripts take 2-3 bytes per character, so stay well under it.
 */
const MAX_BATCH_CHARS = 600_000;
/** A write that keeps meeting newer server copies is set aside after this many tries. */
const MAX_ATTEMPTS = 5;
/** Server errors in a row before a write is set aside, so it stops blocking the queue. */
const MAX_FAILURES = 5;

/** Lowered when a whole batch fails, so the next try sends fewer writes; reset on success. */
let batchLimit = MAX_BATCH;

/** Wait after a failed send: doubles each time, reset by the next successful send. */
const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = { network: 60_000, server: 5 * 60_000 } as const;
let retryDelayMs = 0;
let retryAt = 0;

function backOff(kind: keyof typeof MAX_RETRY_MS): void {
  retryDelayMs = Math.min(
    retryDelayMs === 0 ? FIRST_RETRY_MS : retryDelayMs * 2,
    MAX_RETRY_MS[kind],
  );
  retryAt = Date.now() + retryDelayMs;
}

function sendSucceeded(): void {
  retryDelayMs = 0;
  retryAt = 0;
  batchLimit = MAX_BATCH;
  setCloudReachable(true);
}

const docKeyOf = (op: PendingOp): string => `${op.entity}:${op.docId}`;

/**
 * The next writes to send together: consecutive plain league-document writes this account
 * may send, each for a different document (a second write for the same document must wait
 * for the first's new version), within the count and size limits.
 */
function takeBatch(queue: PendingOp[], uid: string): PendingOp[] {
  const sendable = queue.filter((op) => isSendable(op, uid));
  const first = sendable[0];
  if (!first || !isBatchable(first)) {
    return first ? [first] : [];
  }
  const batch: PendingOp[] = [first];
  const docs = new Set([docKeyOf(first)]);
  let chars = 0;
  for (const op of sendable.slice(1)) {
    if (!isBatchable(op) || docs.has(docKeyOf(op)) || batch.length >= batchLimit) {
      break;
    }
    // Sizes are only worked out once a second write joins, so a lone write costs nothing.
    if (chars === 0) {
      chars = wireSize(first);
    }
    const size = wireSize(op);
    if (chars + size > MAX_BATCH_CHARS) {
      break;
    }
    chars += size;
    docs.add(docKeyOf(op));
    batch.push(op);
  }
  return batch;
}

/** Set a write aside: kept on this phone and in the queue, but never sent until retried. */
async function park(op: PendingOp, parked: Omit<ParkedWrite, 'at'>): Promise<void> {
  logger.error('sync.schedule', 'Write set aside', {
    entity: op.entity,
    docId: op.docId,
    action: op.action,
    reason: parked.reason,
    code: parked.code,
  });
  await updatePending([op.opId], (p) => ({ ...p, parked: { ...parked, at: nowIso() } }));
  noticeParked();
}

function refusalOf(error: unknown): { code?: string; message: string } {
  if (error instanceof RejectedWriteError || error instanceof ApiError) {
    return { code: error.code, message: error.message };
  }
  return { message: 'The server refused this change.' };
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
        await park(op, { reason: 'rejected', ...refusalOf(outcome.error) });
        break;
      case 'retry':
        if (op.attempts + 1 >= MAX_ATTEMPTS) {
          await park(op, {
            reason: 'conflict',
            message: 'Kept meeting newer changes made on another phone.',
          });
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

/**
 * What a failed send means for the queue. Returns true when the pass should carry on with the
 * next writes, false when it should stop and wait for the backoff.
 */
async function handleSendFailure(batch: PendingOp[], error: unknown): Promise<boolean> {
  const head = batch[0]!;
  const meta = {
    ...syncErrorMeta(error),
    entity: head.entity,
    docId: head.docId,
    batch: batch.length,
  };
  if (isTransientError(error)) {
    // Offline, signed out or told to slow down: nothing is wrong with the writes themselves.
    if (isNetworkError(error)) {
      setCloudReachable(false);
      // A big batch can time out on a slow connection every time: send less on the next try.
      batchLimit = Math.max(1, Math.floor(batch.length / 2));
    }
    backOff('network');
    logger.warn('sync.flush', 'Send failed; will retry', meta);
    return false;
  }
  if (batch.length > 1) {
    // The batch as a whole failed (too big, or one write in it): try again in smaller pieces
    // so the culprit ends up alone, and never give up on the others.
    batchLimit = Math.max(1, Math.floor(batch.length / 2));
    logger.warn('sync.flush', 'Batch failed; retrying in smaller batches', meta);
    if (isPermanentWriteError(error)) {
      return true;
    }
    backOff('server');
    return false;
  }
  if (isPermanentWriteError(error)) {
    await park(head, { reason: 'rejected', ...refusalOf(error) });
    return true;
  }
  // A server error on this one write.
  logger.error('sync.flush', 'Send failed', meta);
  backOff('server');
  const failures = (head.failures ?? 0) + 1;
  if (failures >= MAX_FAILURES) {
    await park(head, { reason: 'failing', message: 'The server could not save this change.' });
    return true;
  }
  await updatePending([head.opId], (p) => ({ ...p, failures }));
  return false;
}

/**
 * Send queued writes, oldest first, until the queue is empty or sending must wait. After a
 * failure the next automatic tries are spaced out; `force` (reconnect, the user's Retry) skips
 * that wait.
 */
export async function flushPending(options: { force?: boolean } = {}): Promise<void> {
  if (flushing) {
    // A pass is running; make sure it looks at the queue once more before it stops.
    flushAgain = true;
    return;
  }
  if (!options.force && Date.now() < retryAt) {
    return;
  }
  await loadStore();
  const user = getStore().user;
  if (!user || !shouldCloudSync(user) || !isOnline()) {
    return;
  }

  flushing = true;
  try {
    for (;;) {
      await updateStore((s) => ({ ...s, pendingOps: sortPendingOps(s.pendingOps) }));
      const batch = takeBatch(getStore().pendingOps, user.uid);
      const next = batch[0];
      if (!next) {
        break;
      }
      try {
        const outcomes = isBatchable(next) ? await pushDocBatch(batch) : [await pushSingle(next)];
        await settle(batch, outcomes);
        sendSucceeded();
      } catch (error) {
        if (!(await handleSendFailure(batch, error))) {
          // Retried after the backoff, on reconnect or on the user's Retry: never in a tight loop.
          flushAgain = false;
          break;
        }
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

let lastParkedNoticeAt = 0;

/** Tell the user a change was set aside, once in a while (not per document). */
function noticeParked(): void {
  const now = Date.now();
  if (now - lastParkedNoticeAt > 60_000) {
    lastParkedNoticeAt = now;
    notify.error(
      'A change was not saved online',
      'It is kept on this phone. Use Retry or Discard in the bar at the top of the screen.',
    );
  }
}

/** Forget the backoff and batch narrowing (tests, and a fresh sign-in). */
export function resetSendBackoff(): void {
  retryDelayMs = 0;
  retryAt = 0;
  batchLimit = MAX_BATCH;
}

export { buildCloudUserPayload };
