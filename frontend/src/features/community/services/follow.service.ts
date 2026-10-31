import { z } from 'zod';

import { apiErrorMeta } from '@/shared/api/client';
import { listCommunityDocs } from '@/shared/api/community-api';
import { AppError } from '@/shared/errors/app-error';
import { mergeRemoteRows, pendingDocIdsOf } from '@/shared/sync/merge';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import { scheduleSync } from '@/shared/sync';
import { nowIso } from '@/shared/utils/id';
import type { FollowEdge } from '@/shared/types/domain';

const PAGE = 20;

const followingUidSchema = z.string().trim().min(1).max(128);

export function followIdOf(followerUid: string, followingUid: string): string {
  return `fl_${followerUid}_${followingUid}`;
}

function asFollow(data: Record<string, unknown>, id: string): FollowEdge {
  return {
    id,
    followerUid: String(data.followerUid ?? ''),
    followingUid: String(data.followingUid ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ''),
  };
}

async function mergeRemote(rows: FollowEdge[]): Promise<void> {
  await updateStore((s) => ({
    ...s,
    follows: mergeRemoteRows(s.follows, rows, pendingDocIdsOf(s.pendingOps)),
  }));
}

export async function followPlayer(followingUid: string): Promise<FollowEdge> {
  const parsed = followingUidSchema.safeParse(followingUid);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Choose a player to follow');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  if (user.uid === parsed.data) {
    throw new AppError('VALIDATION', 'You cannot follow yourself');
  }
  const id = followIdOf(user.uid, parsed.data);
  const existing = getStore().follows.find((row) => row.id === id);
  if (existing) {
    return existing;
  }
  const now = nowIso();
  const edge: FollowEdge = {
    id,
    followerUid: user.uid,
    followingUid: parsed.data,
    createdAt: now,
    updatedAt: now,
  };
  // Checked inside the update too, so a double tap never adds the same edge twice.
  await updateStore((s) =>
    s.follows.some((row) => row.id === edge.id) ? s : { ...s, follows: [...s.follows, edge] },
  );
  await scheduleSync([
    {
      entity: 'follow',
      docId: edge.id,
      leagueId: null,
      action: 'upsert',
      payload: edge,
      updatedAt: edge.updatedAt,
    },
  ]);
  logger.info('follow.service', 'Follow created', { followId: edge.id });
  return edge;
}

export async function unfollowPlayer(followingUid: string): Promise<void> {
  const parsed = followingUidSchema.safeParse(followingUid);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Choose a player to unfollow');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  const id = followIdOf(user.uid, parsed.data);
  const existing = getStore().follows.find((row) => row.id === id);
  if (!existing) {
    return;
  }
  await updateStore((s) => ({
    ...s,
    follows: s.follows.filter((row) => row.id !== id),
  }));
  await scheduleSync([
    {
      entity: 'follow',
      docId: id,
      leagueId: null,
      action: 'delete',
      payload: null,
      updatedAt: nowIso(),
    },
  ]);
  logger.info('follow.service', 'Follow removed', { followId: id });
}

export function isFollowing(followerUid: string, followingUid: string): boolean {
  return getStore().follows.some(
    (row) => row.followerUid === followerUid && row.followingUid === followingUid,
  );
}

export async function listFollowGraph(
  uid: string,
  opts: { refresh?: boolean } = {},
): Promise<{
  followers: FollowEdge[];
  following: FollowEdge[];
}> {
  await loadStore();
  const user = getStore().user;
  // refresh: false reads only this phone's copy (for re-renders on local changes).
  if (opts.refresh !== false && shouldCloudSync(user) && isOnline()) {
    try {
      const [followers, following] = await Promise.all([
        listCommunityDocs<Record<string, unknown>>('follow', { subject: uid, limit: PAGE }),
        listCommunityDocs<Record<string, unknown>>('follow', { owner: uid, limit: PAGE }),
      ]);
      await mergeRemote(
        [...followers.items, ...following.items].map((d) => asFollow(d, String(d.id ?? ''))),
      );
    } catch (error) {
      logger.error('follow.service', 'Follow query failed', apiErrorMeta(error));
    }
  }
  const follows = getStore().follows;
  return {
    followers: follows
      .filter((row) => row.followingUid === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, PAGE),
    following: follows
      .filter((row) => row.followerUid === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, PAGE),
  };
}

export function displayNameForUid(uid: string): string {
  const store = getStore();
  const profile = store.playerProfiles.find((row) => row.uid === uid);
  if (profile) {
    return profile.displayName;
  }
  const player = store.players.find((row) => row.authUid === uid);
  if (player) {
    return player.displayName;
  }
  if (store.user?.uid === uid) {
    return store.user.displayName;
  }
  return 'Player';
}
