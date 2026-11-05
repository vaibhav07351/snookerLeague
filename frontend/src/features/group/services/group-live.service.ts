import { z } from 'zod';

import {
  atTableAfter,
  frameLeaders,
  groupMatchWinner,
  nextBreakerId,
  replayGroupFrame,
} from '@/features/group/services/group-frame-engine';
import {
  canManageGroupMatch,
  persistGroupMatch,
  requireGroupMatch,
  serializeGroupWrite,
} from '@/features/group/services/group.service';
import { freeBallValue, tableStateFromShots } from '@/features/match/services/table-state';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore } from '@/shared/storage/local-store';
import type {
  FeedEvent,
  GroupFrame,
  GroupMatch,
  GroupOpenFrame,
  GroupShot,
} from '@/shared/types/domain';
import { createId, nowIso } from '@/shared/utils/id';
import { resultEventId } from '@/shared/utils/result-event';
import { movePlayerAfter } from '@/shared/utils/turn-order';

const ballSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const shotInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pot'), ball: ballSchema }),
  z.object({ kind: z.literal('foul'), points: z.number().int().min(4).max(7) }),
  z.object({ kind: z.literal('miss') }),
  z.object({ kind: z.literal('safety') }),
  z.object({ kind: z.literal('free_ball') }),
]);

export type GroupShotInput = z.infer<typeof shotInputSchema>;

interface LiveGroup {
  group: GroupMatch;
  open: GroupOpenFrame;
}

async function requireLive(groupId: string): Promise<LiveGroup> {
  const group = await requireGroupMatch(groupId);
  if (group.status !== 'in_progress' || !group.openFrame) {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }
  return { group, open: group.openFrame };
}

/** The player whose shot is logged next (falls back to the breaker if the seat is stale). */
function shooterOf({ group, open }: LiveGroup): string {
  if (group.playerIds.includes(open.atTablePlayerId)) {
    return open.atTablePlayerId;
  }
  return open.breakerId;
}

function buildShot(live: LiveGroup, input: GroupShotInput): GroupShot {
  const base = { id: createId('gs'), at: nowIso(), playerId: shooterOf(live) };
  switch (input.kind) {
    case 'pot':
      return { ...base, kind: 'pot', points: input.ball, ball: input.ball };
    case 'foul':
      return { ...base, kind: 'foul', points: input.points };
    case 'free_ball': {
      // A free ball is worth the ball on (1 while reds remain, else the colour in sequence).
      const ball = freeBallValue(tableStateFromShots(live.open.shots));
      return { ...base, kind: 'free_ball', points: ball, ball };
    }
    case 'miss':
    case 'safety':
      return { ...base, kind: input.kind, points: 0 };
  }
}

function withOpenFrame(group: GroupMatch, open: GroupOpenFrame): GroupMatch {
  return { ...group, openFrame: open, updatedAt: nowIso() };
}

export function recordShot(groupId: string, input: GroupShotInput): Promise<GroupMatch> {
  return serializeGroupWrite(groupId, async () => {
    const parsed = shotInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Invalid shot');
    }
    const live = await requireLive(groupId);
    const shot = buildShot(live, parsed.data);
    const { group, open } = live;
    const updated = withOpenFrame(group, {
      ...open,
      shots: [...open.shots, shot],
      atTablePlayerId: atTableAfter(shot, group.turnOrder, group.playerIds),
      // The frame clock starts on the first thing logged in the frame.
      startedAt: open.startedAt ?? shot.at,
    });
    await persistGroupMatch(updated);
    logger.info('group-live.service', 'Shot recorded', { groupId, kind: shot.kind });
    return updated;
  });
}

/**
 * Put a player at the table by hand. They play after whoever shot last, so that seat is
 * learned and later visits follow the real order. Before the first shot of a frame this
 * also changes who breaks off.
 */
export function setAtTablePlayer(groupId: string, playerId: string): Promise<GroupMatch> {
  return serializeGroupWrite(groupId, async () => {
    const { group, open } = await requireLive(groupId);
    if (!group.playerIds.includes(playerId)) {
      throw new AppError('VALIDATION', 'That player is not in this match');
    }
    const lastShooter = open.shots[open.shots.length - 1]?.playerId ?? null;
    const turnOrder = lastShooter
      ? movePlayerAfter(group.turnOrder, lastShooter, playerId)
      : group.turnOrder;
    const updated: GroupMatch = {
      ...withOpenFrame(group, {
        ...open,
        atTablePlayerId: playerId,
        breakerId: open.shots.length === 0 ? playerId : open.breakerId,
      }),
      turnOrder,
    };
    await persistGroupMatch(updated);
    logger.info('group-live.service', 'At-table player set', { groupId });
    return updated;
  });
}

/** Take back the last shot, or reopen the last frame when this one has nothing logged yet. */
export function undoLast(groupId: string): Promise<GroupMatch> {
  return serializeGroupWrite(groupId, async () => {
    const group = await requireGroupMatch(groupId);
    const open = group.openFrame;
    const last = open?.shots[open.shots.length - 1];
    if (open && last) {
      const shots = open.shots.slice(0, -1);
      const updated = withOpenFrame(group, {
        ...open,
        shots,
        atTablePlayerId: last.playerId,
        startedAt: shots.length > 0 ? (open.startedAt ?? null) : null,
      });
      await persistGroupMatch(updated);
      logger.info('group-live.service', 'Shot undone', { groupId, kind: last.kind });
      return updated;
    }
    const lastFrame = group.frames[group.frames.length - 1];
    if (!lastFrame) {
      throw new AppError('INVALID_STATE', 'Nothing to undo');
    }
    // Reopening a finished match changes its result: only its creator or the league owner.
    if (group.status === 'completed' && !canManageGroupMatch(group, getStore().user?.uid)) {
      throw new AppError('FORBIDDEN', 'Only the match creator or league owner can reopen it');
    }
    const updated = reopenFrame(group, lastFrame);
    await persistGroupMatch(updated);
    logger.info('group-live.service', 'Last frame reopened', { groupId });
    return updated;
  });
}

function reopenFrame(group: GroupMatch, frame: GroupFrame): GroupMatch {
  const shots = frame.shots ?? [];
  const breakerId = frame.breakerId ?? group.turnOrder[0] ?? group.playerIds[0] ?? '';
  const lastShot = shots[shots.length - 1];
  return {
    ...group,
    frames: group.frames.slice(0, -1),
    openFrame: {
      shots,
      breakerId,
      atTablePlayerId: lastShot
        ? atTableAfter(lastShot, group.turnOrder, group.playerIds)
        : breakerId,
      startedAt: shots[0]?.at ?? null,
    },
    status: 'in_progress',
    winnerId: null,
    finishedAt: null,
    updatedAt: nowIso(),
  };
}

function secondsBetween(fromIso: string | null | undefined, toIso: string): number | undefined {
  if (!fromIso) {
    return undefined;
  }
  const seconds = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/**
 * End the frame. The winner must be the top scorer (or one of the tied top scorers). Ends
 * the match once nobody can catch the leader, otherwise sets up the next frame with the
 * break passed round the table.
 */
export function endFrame(groupId: string, winnerId: string): Promise<GroupMatch> {
  return serializeGroupWrite(groupId, async () => {
    const { group, open } = await requireLive(groupId);
    const { points } = replayGroupFrame(open.shots, group.playerIds);
    if (!frameLeaders(points).includes(winnerId)) {
      throw new AppError('VALIDATION', 'Only the top scorer can win the frame');
    }
    const now = nowIso();
    const durationSeconds = secondsBetween(open.startedAt, now);
    const frame: GroupFrame = {
      points,
      winnerId,
      breakerId: open.breakerId,
      shots: open.shots,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    };
    const frames = [...group.frames, frame];
    const matchWinner = groupMatchWinner(frames, group.bestOf, group.playerIds);

    if (matchWinner) {
      const finished: GroupMatch = {
        ...group,
        frames,
        openFrame: null,
        status: 'completed',
        winnerId: matchWinner,
        finishedAt: now,
        updatedAt: now,
      };
      await persistGroupMatch(finished, groupWonEvent(finished, matchWinner, now));
      logger.info('group-live.service', 'Free-for-all match completed', {
        groupId,
        frames: frames.length,
      });
      return finished;
    }

    const breakerId =
      nextBreakerId(frames, group.turnOrder, group.playerIds) ?? group.playerIds[0] ?? winnerId;
    const next: GroupMatch = {
      ...group,
      frames,
      openFrame: { shots: [], breakerId, atTablePlayerId: breakerId, startedAt: null },
      updatedAt: now,
    };
    await persistGroupMatch(next);
    logger.info('group-live.service', 'Frame ended', { groupId, frame: frames.length });
    return next;
  });
}

function groupWonEvent(group: GroupMatch, winnerId: string, at: string): FeedEvent {
  return {
    id: resultEventId(group.id),
    leagueId: group.leagueId,
    type: 'group_won',
    createdAt: at,
    updatedAt: at,
    title: 'Free-for-all complete',
    body: group.namedLabel ?? `${group.playerIds.length} players, best of ${group.bestOf}`,
    relatedIds: [winnerId, group.id],
  };
}
