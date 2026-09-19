import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { followsCol, shouldCloudSync } from '@/shared/sync/firestore-paths';
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
  await updateStore((s) => {
    const map = new Map(s.follows.map((row) => [row.id, row]));
    for (const row of rows) {
      map.set(row.id, row);
    }
    return { ...s, follows: [...map.values()] };
  });
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
  await updateStore((s) => ({ ...s, follows: [...s.follows, edge] }));
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

export async function listFollowGraph(uid: string): Promise<{
  followers: FollowEdge[];
  following: FollowEdge[];
}> {
  await loadStore();
  const user = getStore().user;
  if (shouldCloudSync(user) && isOnline()) {
    try {
      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(
          query(
            followsCol(),
            where('followingUid', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(PAGE),
          ),
        ),
        getDocs(
          query(
            followsCol(),
            where('followerUid', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(PAGE),
          ),
        ),
      ]);
      await mergeRemote([
        ...followersSnap.docs.map((d) => asFollow(d.data(), d.id)),
        ...followingSnap.docs.map((d) => asFollow(d.data(), d.id)),
      ]);
    } catch (error) {
      logger.error('follow.service', 'Follow query failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
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
