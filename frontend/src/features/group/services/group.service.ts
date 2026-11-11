import { z } from 'zod';

import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, type ScheduleItem } from '@/shared/sync';
import type { FeedEvent, GameListOptions, GroupMatch } from '@/shared/types/domain';
import { createId, nowIso } from '@/shared/utils/id';
import { applyResultEvent } from '@/shared/utils/result-event';
import { serializeWrite } from '@/shared/utils/serialize-write';

export const MIN_GROUP_PLAYERS = 3;
export const MAX_GROUP_PLAYERS = 8;

const createGroupSchema = z.object({
  leagueId: z.string().min(1),
  createdByUid: z.string().min(1),
  playerIds: z.array(z.string().min(1)).min(MIN_GROUP_PLAYERS).max(MAX_GROUP_PLAYERS),
  bestOf: z.number().int().min(1).max(35),
  namedLabel: z.string().trim().max(40).nullable(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Run writes to one free-for-all match one at a time (quick taps must not lose a shot). */
export function serializeGroupWrite<T>(groupId: string, write: () => Promise<T>): Promise<T> {
  return serializeWrite(`group_match:${groupId}`, write);
}

export async function listGroupMatches(
  leagueId: string,
  opts?: GameListOptions,
): Promise<GroupMatch[]> {
  await loadStore();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return getStore()
    .groupMatches.filter((g) => g.leagueId === leagueId)
    .sort((a, b) =>
      opts?.order === 'started'
        ? b.createdAt.localeCompare(a.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(offset, offset + limit);
}

export async function listLiveGroupMatches(leagueId: string): Promise<GroupMatch[]> {
  await loadStore();
  return getStore()
    .groupMatches.filter((g) => g.leagueId === leagueId && g.status === 'in_progress')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
}

export async function getGroupMatch(groupId: string): Promise<GroupMatch | null> {
  await loadStore();
  return getStore().groupMatches.find((g) => g.id === groupId) ?? null;
}

export async function createGroupMatch(input: CreateGroupInput): Promise<GroupMatch> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      `Pick ${MIN_GROUP_PLAYERS} to ${MAX_GROUP_PLAYERS} players and a number of frames`,
    );
  }
  const { playerIds } = parsed.data;
  if (new Set(playerIds).size !== playerIds.length) {
    throw new AppError('VALIDATION', 'Players must be different');
  }
  const breakerId = playerIds[0];
  if (!breakerId) {
    throw new AppError('VALIDATION', 'Pick the players');
  }

  const now = nowIso();
  const group: GroupMatch = {
    id: createId('gm'),
    leagueId: parsed.data.leagueId,
    createdAt: now,
    updatedAt: now,
    createdByUid: parsed.data.createdByUid,
    playerIds: [...playerIds],
    turnOrder: [...playerIds],
    bestOf: parsed.data.bestOf,
    namedLabel: parsed.data.namedLabel,
    frames: [],
    openFrame: { shots: [], breakerId, atTablePlayerId: breakerId, startedAt: null },
    status: 'in_progress',
    winnerId: null,
    finishedAt: null,
  };

  await updateStore((s) => ({ ...s, groupMatches: [...s.groupMatches, group] }));
  await scheduleSync([groupSyncItem(group)]);
  logger.info('group.service', 'Free-for-all match created', {
    groupId: group.id,
    players: playerIds.length,
  });
  return group;
}

function groupSyncItem(group: GroupMatch): ScheduleItem {
  return {
    entity: 'group_match',
    docId: group.id,
    leagueId: group.leagueId,
    action: 'upsert',
    payload: group,
    updatedAt: group.updatedAt,
  };
}

/** Load a free-for-all match or fail with NOT_FOUND. */
export async function requireGroupMatch(groupId: string): Promise<GroupMatch> {
  await loadStore();
  const found = getStore().groupMatches.find((g) => g.id === groupId);
  if (!found) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  return found;
}

/**
 * Save a free-for-all match (and an optional feed event), recompute the league's player
 * stats, and queue the changed documents for sync.
 */
export async function persistGroupMatch(group: GroupMatch, event?: FeedEvent): Promise<GroupMatch> {
  // The match's one result post: added or replaced when it finishes, withdrawn when the
  // finished match is reopened.
  const changed: { event: FeedEvent | null } = { event: null };
  await updateStore((s) => {
    const groupMatches = s.groupMatches.map((g) => (g.id === group.id ? group : g));
    let events = s.events;
    if (event || group.status !== 'completed') {
      const result = applyResultEvent(s.events, group.id, event ?? null, nowIso());
      events = result.events;
      changed.event = result.changed;
    }
    // Derived stats: not an edit of the player, so no updatedAt bump.
    const players = applyPlayerStats(s.players, group.leagueId, {
      matches: s.matches,
      races: s.races,
      groupMatches,
    });
    return { ...s, groupMatches, events, players };
  });

  const items: ScheduleItem[] = [groupSyncItem(group)];
  const saved = changed.event;
  if (saved) {
    items.push({
      entity: 'event',
      docId: saved.id,
      leagueId: saved.leagueId,
      action: 'upsert',
      payload: saved,
      updatedAt: saved.updatedAt,
    });
  }
  await scheduleSync(items);
  return group;
}

/** The match creator or the league owner may delete a free-for-all match. */
export function canManageGroupMatch(
  group: Pick<GroupMatch, 'createdByUid' | 'leagueId'>,
  uid: string | null | undefined,
): boolean {
  if (!uid) {
    return false;
  }
  const league = getStore().leagues.find((l) => l.id === group.leagueId);
  return group.createdByUid === uid || league?.createdByUid === uid;
}

/** Abandon and delete a free-for-all match; stats are recomputed without it. */
export function deleteGroupMatch(groupId: string): Promise<void> {
  return serializeGroupWrite(groupId, async () => {
    const group = await requireGroupMatch(groupId);
    if (!canManageGroupMatch(group, getStore().user?.uid)) {
      throw new AppError('FORBIDDEN', 'Only the match creator or league owner can do this');
    }
    const changed: { event: FeedEvent | null } = { event: null };
    await updateStore((s) => {
      const groupMatches = s.groupMatches.filter((g) => g.id !== groupId);
      const players = applyPlayerStats(s.players, group.leagueId, {
        matches: s.matches,
        races: s.races,
        groupMatches,
      });
      // A deleted match's result post is withdrawn too.
      const result = applyResultEvent(s.events, group.id, null, nowIso());
      changed.event = result.changed;
      return { ...s, groupMatches, players, events: result.events };
    });
    const items: ScheduleItem[] = [
      {
        entity: 'group_match',
        docId: group.id,
        leagueId: group.leagueId,
        action: 'delete',
        payload: null,
        updatedAt: nowIso(),
      },
    ];
    const retracted = changed.event;
    if (retracted) {
      items.push({
        entity: 'event',
        docId: retracted.id,
        leagueId: retracted.leagueId,
        action: 'upsert',
        payload: retracted,
        updatedAt: retracted.updatedAt,
      });
    }
    await scheduleSync(items);
    logger.info('group.service', 'Free-for-all match deleted', { groupId });
  });
}
