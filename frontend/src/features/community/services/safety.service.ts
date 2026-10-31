import { apiErrorMeta } from '@/shared/api/client';
import { listCommunityDocs } from '@/shared/api/community-api';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { BLOCKED_KEY, readPreference, writePreference } from '@/shared/storage/preferences';
import { scheduleSync, shouldCloudSync } from '@/shared/sync';
import { isOnline } from '@/shared/sync/connectivity';
import { createId, nowIso } from '@/shared/utils/id';

export type ReportTarget = 'profile' | 'looking' | 'directory' | 'player' | 'match' | 'user';

let blocked: Set<string> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Set<string>> {
  if (!blocked) {
    const raw = await readPreference(BLOCKED_KEY);
    let ids: string[] = [];
    try {
      ids = raw ? (JSON.parse(raw) as string[]) : [];
    } catch (error) {
      logger.warn('safety.service', 'Ignoring an unreadable block list', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
    blocked = new Set(Array.isArray(ids) ? ids : []);
  }
  return blocked;
}

async function save(next: Set<string>): Promise<void> {
  blocked = next;
  await writePreference(BLOCKED_KEY, JSON.stringify([...next]));
  listeners.forEach((l) => l());
}

/** People this user blocked (loaded once, then kept in memory). */
export async function blockedUids(): Promise<Set<string>> {
  return load();
}

/** Synchronous check for list filters; empty until the list has loaded once. */
export function isBlocked(uid: string | null | undefined): boolean {
  return uid != null && (blocked?.has(uid) ?? false);
}

export function subscribeBlocks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function blockId(blocker: string, blockedUid: string): string {
  return `bl_${blocker}_${blockedUid}`;
}

/**
 * Block someone: their posts, listings and profile disappear from this phone's lists, and the
 * server refuses their follows and challenges to you.
 */
export async function blockUser(uid: string): Promise<void> {
  await loadStore();
  const me = getStore().user;
  if (!me || me.uid === uid) {
    throw new AppError('INVALID_STATE', 'You cannot block yourself');
  }
  const next = new Set(await load());
  next.add(uid);
  await save(next);
  const id = blockId(me.uid, uid);
  await scheduleSync([
    {
      entity: 'block',
      docId: id,
      leagueId: null,
      action: 'upsert',
      payload: { id, blockerUid: me.uid, blockedUid: uid, createdAt: nowIso() },
    },
  ]);
  logger.info('safety.service', 'Blocked a user');
}

export async function unblockUser(uid: string): Promise<void> {
  await loadStore();
  const me = getStore().user;
  if (!me) {
    return;
  }
  const next = new Set(await load());
  next.delete(uid);
  await save(next);
  await scheduleSync([
    {
      entity: 'block',
      docId: blockId(me.uid, uid),
      leagueId: null,
      action: 'delete',
      payload: null,
    },
  ]);
}

/** Refresh the block list from the server (another phone may have changed it). */
export async function refreshBlocks(): Promise<void> {
  await loadStore();
  if (!shouldCloudSync(getStore().user) || !isOnline()) {
    return;
  }
  try {
    const page = await listCommunityDocs<{ blockedUid?: string }>('block', { limit: 100 });
    const ids = page.items.map((b) => b.blockedUid).filter((v): v is string => !!v);
    await save(new Set(ids));
  } catch (error) {
    logger.warn('safety.service', 'Block list refresh failed', apiErrorMeta(error));
  }
}

/** Flag a post, listing, profile or match for the team to review. */
export async function reportContent(input: {
  targetKind: ReportTarget;
  targetId: string;
  targetUid?: string | null;
  reason: string;
}): Promise<void> {
  await loadStore();
  const me = getStore().user;
  if (!me) {
    throw new AppError('NOT_SIGNED_IN', 'Sign in to report');
  }
  if (me.isDemo) {
    throw new AppError('NEEDS_ACCOUNT', 'Sign in with Google to report content.');
  }
  const id = createId('rp');
  await scheduleSync([
    {
      entity: 'report',
      docId: id,
      leagueId: null,
      action: 'upsert',
      payload: {
        id,
        reporterUid: me.uid,
        targetKind: input.targetKind,
        targetId: input.targetId,
        targetUid: input.targetUid ?? null,
        reason: input.reason.trim().slice(0, 500),
        createdAt: nowIso(),
      },
    },
  ]);
  logger.info('safety.service', 'Report sent', { targetKind: input.targetKind });
}
