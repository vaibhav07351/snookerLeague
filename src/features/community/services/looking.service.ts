import { getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { lookingPostsCol, shouldCloudSync } from '@/shared/sync/firestore-paths';
import { scheduleSync } from '@/shared/sync';
import { createId, nowIso } from '@/shared/utils/id';
import type { LookingKind, LookingPost, LookingStatus } from '@/shared/types/domain';

const PAGE = 20;

const createSchema = z.object({
  cityId: z.string().min(1),
  cityName: z.string().trim().min(1).max(80),
  kind: z.enum(['opponent', 'player', 'club', 'table']),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().max(280),
});

export const LOOKING_KIND_LABEL: Record<LookingKind, string> = {
  opponent: 'Opponent',
  player: 'Player',
  club: 'Club',
  table: 'Table',
};

function asPost(data: Record<string, unknown>, id: string): LookingPost {
  const kind = data.kind;
  const status = data.status;
  return {
    id,
    cityId: String(data.cityId ?? ''),
    cityName: String(data.cityName ?? ''),
    createdByUid: String(data.createdByUid ?? ''),
    authorName: String(data.authorName ?? 'Player'),
    kind:
      kind === 'player' || kind === 'club' || kind === 'table' || kind === 'opponent'
        ? kind
        : 'opponent',
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    status: status === 'closed' ? 'closed' : 'open',
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ''),
  };
}

async function persist(post: LookingPost): Promise<void> {
  await updateStore((s) => {
    const has = s.lookingPosts.some((p) => p.id === post.id);
    return {
      ...s,
      lookingPosts: has
        ? s.lookingPosts.map((p) => (p.id === post.id ? post : p))
        : [...s.lookingPosts, post],
    };
  });
  await scheduleSync([
    {
      entity: 'looking',
      docId: post.id,
      leagueId: null,
      action: 'upsert',
      payload: post,
      updatedAt: post.updatedAt,
    },
  ]);
}

export async function createLookingPost(input: {
  cityId: string;
  cityName: string;
  kind: LookingKind;
  title: string;
  body: string;
}): Promise<LookingPost> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Need a short title for this Looking post');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  const now = nowIso();
  const post: LookingPost = {
    id: createId('lp'),
    cityId: parsed.data.cityId,
    cityName: parsed.data.cityName,
    createdByUid: user.uid,
    authorName: user.displayName,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  await persist(post);
  logger.info('looking.service', 'Looking post created', { postId: post.id, kind: post.kind });
  return post;
}

export async function closeLookingPost(postId: string): Promise<LookingPost> {
  await loadStore();
  const user = getStore().user;
  const post = getStore().lookingPosts.find((p) => p.id === postId);
  if (!user || !post) {
    throw new AppError('NOT_FOUND', 'Post not found');
  }
  if (post.createdByUid !== user.uid) {
    throw new AppError('FORBIDDEN', 'Only you can close this post');
  }
  if (post.status === 'closed') {
    return post;
  }
  const next: LookingPost = { ...post, status: 'closed', updatedAt: nowIso() };
  await persist(next);
  logger.info('looking.service', 'Looking post closed', { postId });
  return next;
}

export async function listLookingPosts(input: {
  cityId: string;
  kind?: LookingKind | 'all';
  includeClosed?: boolean;
}): Promise<LookingPost[]> {
  await loadStore();
  const user = getStore().user;
  if (shouldCloudSync(user) && isOnline()) {
    try {
      const snap = await getDocs(
        query(
          lookingPostsCol(),
          where('cityId', '==', input.cityId),
          orderBy('createdAt', 'desc'),
          limit(PAGE),
        ),
      );
      const remote = snap.docs.map((d) => asPost(d.data(), d.id));
      await updateStore((s) => {
        const map = new Map(s.lookingPosts.map((p) => [p.id, p]));
        for (const row of remote) {
          map.set(row.id, row);
        }
        return { ...s, lookingPosts: [...map.values()] };
      });
    } catch (error) {
      logger.error('looking.service', 'Looking query failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  const kind = input.kind ?? 'all';
  const includeClosed = input.includeClosed === true;
  return getStore()
    .lookingPosts.filter((p) => {
      if (p.cityId !== input.cityId) {
        return false;
      }
      if (kind !== 'all' && p.kind !== kind) {
        return false;
      }
      if (!includeClosed && p.status === 'closed') {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, PAGE);
}

export function lookingStatusOf(status: LookingStatus): string {
  return status === 'closed' ? 'CLOSED' : 'OPEN';
}
