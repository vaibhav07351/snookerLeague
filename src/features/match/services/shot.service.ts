import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import type { ScheduleItem } from '@/shared/sync/schedule';
import {
  emptyOpenFrame,
  type BallValue,
  type FrameScore,
  type Match,
  type OpenFrame,
  type Shot,
  type ShotKind,
} from '@/shared/types/domain';

const ballSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

const potSchema = z.object({
  kind: z.literal('pot'),
  ball: ballSchema,
});

const foulSchema = z.object({
  kind: z.literal('foul'),
  points: z.number().int().min(4).max(7),
});

const endVisitSchema = z.object({
  kind: z.enum(['miss', 'safety']),
});

const freeBallSchema = z.object({
  kind: z.literal('free_ball'),
  ball: ballSchema.optional(),
});

export function isMatchScorer(match: Match, uid: string): boolean {
  return (match.scorerUid ?? match.createdByUid) === uid;
}

/** When a visit returns to a doubles pair, the partner who sat out comes in. */
export function incomingPartner(team: string[], lastPlayerId: string | null): string | null {
  if (team.length === 0) {
    return lastPlayerId;
  }
  if (team.length === 1) {
    return team[0] ?? lastPlayerId;
  }
  if (!lastPlayerId || !team.includes(lastPlayerId)) {
    return team[0] ?? null;
  }
  return team.find((id) => id !== lastPlayerId) ?? lastPlayerId;
}

export function replayOpenFrame(
  shots: Shot[],
  startAt: 'a' | 'b' = 'a',
  teams?: { a: string[]; b: string[] },
): OpenFrame {
  let atTable: 'a' | 'b' = startAt;
  let teamAPoints = 0;
  let teamBPoints = 0;
  let currentBreak = 0;
  let currentBreakSide: 'a' | 'b' = startAt;
  let atTablePlayerId: string | null = null;
  const lastPlayerIdBySide: { a: string | null; b: string | null } = { a: null, b: null };

  function seatIncoming(side: 'a' | 'b'): void {
    const roster = side === 'a' ? (teams?.a ?? []) : (teams?.b ?? []);
    atTablePlayerId = incomingPartner(roster, lastPlayerIdBySide[side]);
  }

  for (const shot of shots) {
    const playerId = shot.playerId ?? null;
    if (playerId) {
      lastPlayerIdBySide[shot.side] = playerId;
    }
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      atTable = shot.side;
      if (shot.side === 'a') {
        teamAPoints += shot.points;
      } else {
        teamBPoints += shot.points;
      }
      if (currentBreakSide === shot.side && (!playerId || atTablePlayerId === playerId)) {
        currentBreak += shot.points;
      } else {
        currentBreak = shot.points;
        currentBreakSide = shot.side;
      }
      if (playerId) {
        atTablePlayerId = playerId;
      }
    } else if (shot.kind === 'foul') {
      const awarded: 'a' | 'b' = shot.side === 'a' ? 'b' : 'a';
      if (awarded === 'a') {
        teamAPoints += shot.points;
      } else {
        teamBPoints += shot.points;
      }
      currentBreak = 0;
      currentBreakSide = awarded;
      atTable = awarded;
      seatIncoming(awarded);
    } else {
      currentBreak = 0;
      atTable = shot.side === 'a' ? 'b' : 'a';
      currentBreakSide = atTable;
      seatIncoming(atTable);
    }
  }

  return {
    shots,
    teamAPoints,
    teamBPoints,
    atTable,
    currentBreak,
    currentBreakSide,
    atTablePlayerId,
    lastPlayerIdBySide,
  };
}

export function visitBreaks(
  shots: Shot[],
): { side: 'a' | 'b'; value: number; playerId: string | null }[] {
  const visits: { side: 'a' | 'b'; value: number; playerId: string | null }[] = [];
  let current = 0;
  let side: 'a' | 'b' | null = null;
  let playerId: string | null = null;
  const flush = (): void => {
    if (side && current > 0) {
      visits.push({ side, value: current, playerId });
    }
    current = 0;
    side = null;
    playerId = null;
  };
  for (const shot of shots) {
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      const shotPlayer = shot.playerId ?? null;
      if (
        side != null &&
        (side !== shot.side || (shotPlayer && playerId && shotPlayer !== playerId))
      ) {
        flush();
      }
      side = shot.side;
      if (shotPlayer) {
        playerId = shotPlayer;
      }
      current += shot.points;
    } else {
      flush();
    }
  }
  flush();
  return visits;
}

export function highestBreakFromShots(shots: Shot[], side?: 'a' | 'b'): number {
  const visits = visitBreaks(shots);
  const filtered = side ? visits.filter((v) => v.side === side) : visits;
  return filtered.reduce((max, v) => Math.max(max, v.value), 0);
}

function requireInProgress(match: Match): void {
  if (match.outcome.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }
}

async function writeOpenFrame(match: Match, openFrame: OpenFrame): Promise<Match> {
  const updated: Match = {
    ...match,
    openFrame,
    updatedAt: nowIso(),
  };
  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === updated.id ? updated : m)),
  }));
  await scheduleSync([
    {
      entity: 'match',
      docId: updated.id,
      leagueId: updated.leagueId,
      action: 'upsert',
      payload: updated,
      updatedAt: updated.updatedAt,
    },
  ]);
  return updated;
}

function teamForPlayer(match: Match, playerId: string): 'a' | 'b' | null {
  if (match.teamA.includes(playerId)) {
    return 'a';
  }
  if (match.teamB.includes(playerId)) {
    return 'b';
  }
  return null;
}

function defaultPlayerId(match: Match, side: 'a' | 'b', open: OpenFrame): string | null {
  if (open.atTablePlayerId) {
    const owned = teamForPlayer(match, open.atTablePlayerId);
    if (owned === side) {
      return open.atTablePlayerId;
    }
  }
  const last = open.lastPlayerIdBySide?.[side];
  if (last && teamForPlayer(match, last) === side) {
    return last;
  }
  const team = side === 'a' ? match.teamA : match.teamB;
  return team[0] ?? null;
}

export async function setAtTablePlayer(matchId: string, playerId: string): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  requireInProgress(match);
  const side = teamForPlayer(match, playerId);
  if (!side) {
    throw new AppError('VALIDATION', 'Player is not in this match');
  }
  const open = match.openFrame ?? emptyOpenFrame(side, playerId);
  const sameVisit = open.atTable === side && open.atTablePlayerId === playerId;
  const next: OpenFrame = {
    ...open,
    atTable: side,
    currentBreak: sameVisit ? open.currentBreak : 0,
    currentBreakSide: side,
    atTablePlayerId: playerId,
    lastPlayerIdBySide: {
      a: open.lastPlayerIdBySide?.a ?? null,
      b: open.lastPlayerIdBySide?.b ?? null,
      [side]: playerId,
    },
  };
  const updated = await writeOpenFrame(match, next);
  logger.info('shot.service', 'At-table player set', { matchId, side });
  return updated;
}

export async function startLiveFrame(matchId: string, atTable: 'a' | 'b' = 'a'): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  requireInProgress(match);
  if (match.openFrame && match.openFrame.shots.length > 0) {
    return match;
  }
  const playerId = atTable === 'a' ? (match.teamA[0] ?? null) : (match.teamB[0] ?? null);
  const updated = await writeOpenFrame(match, emptyOpenFrame(atTable, playerId));
  logger.info('shot.service', 'Live frame started', { matchId });
  return updated;
}

export async function recordShot(
  matchId: string,
  input:
    | { kind: 'pot'; ball: BallValue }
    | { kind: 'foul'; points: number }
    | { kind: 'miss' | 'safety' }
    | { kind: 'free_ball'; ball?: BallValue },
): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  requireInProgress(match);

  const open = match.openFrame ?? emptyOpenFrame('a', match.teamA[0] ?? null);
  const side = open.atTable;
  const playerId = defaultPlayerId(match, side, open);
  let shot: Shot;

  if (input.kind === 'pot') {
    const parsed = potSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Invalid pot');
    }
    shot = {
      id: createId('sh'),
      at: nowIso(),
      side,
      kind: 'pot',
      points: parsed.data.ball,
      ball: parsed.data.ball,
      playerId,
    };
  } else if (input.kind === 'foul') {
    const parsed = foulSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Foul must be 4–7 points');
    }
    shot = {
      id: createId('sh'),
      at: nowIso(),
      side,
      kind: 'foul',
      points: parsed.data.points,
      playerId,
    };
  } else if (input.kind === 'free_ball') {
    const parsed = freeBallSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Invalid free ball');
    }
    const ball = parsed.data.ball ?? 1;
    shot = {
      id: createId('sh'),
      at: nowIso(),
      side,
      kind: 'free_ball',
      points: ball,
      ball,
      playerId,
    };
  } else {
    const parsed = endVisitSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'Invalid shot');
    }
    shot = {
      id: createId('sh'),
      at: nowIso(),
      side,
      kind: parsed.data.kind,
      points: 0,
      playerId,
    };
  }

  const next = replayOpenFrame([...open.shots, shot], 'a', {
    a: match.teamA,
    b: match.teamB,
  });
  const updated = await writeOpenFrame(match, next);
  logger.info('shot.service', 'Shot recorded', { matchId, kind: shot.kind });
  return updated;
}

export async function undoLastShot(matchId: string): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  requireInProgress(match);
  const open = match.openFrame;
  if (!open || open.shots.length === 0) {
    throw new AppError('INVALID_STATE', 'No shot to undo');
  }
  const next = replayOpenFrame(open.shots.slice(0, -1), 'a', {
    a: match.teamA,
    b: match.teamB,
  });
  return writeOpenFrame(match, next);
}

export async function completeLiveFrame(matchId: string, winner: 'a' | 'b'): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  requireInProgress(match);
  const open = match.openFrame ?? emptyOpenFrame('a');
  const shots = open.shots;
  const { addFrame } = await import('@/features/match/services/match.service');
  const scored = await addFrame(matchId, {
    teamAPoints: open.teamAPoints,
    teamBPoints: open.teamBPoints,
    winner,
  });
  const lastIndex = scored.frames.length - 1;
  const frames: FrameScore[] = scored.frames.map((f, i) =>
    i === lastIndex
      ? {
          ...f,
          shots,
          highestBreakA: highestBreakFromShots(shots, 'a'),
          highestBreakB: highestBreakFromShots(shots, 'b'),
        }
      : f,
  );
  const withShots: Match = {
    ...scored,
    frames,
    openFrame: emptyOpenFrame(
      winner === 'a' ? 'b' : 'a',
      (winner === 'a' ? scored.teamB[0] : scored.teamA[0]) ?? null,
    ),
    updatedAt: nowIso(),
  };
  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === withShots.id ? withShots : m)),
  }));
  const syncItems: ScheduleItem[] = [
    {
      entity: 'match',
      docId: withShots.id,
      leagueId: withShots.leagueId,
      action: 'upsert',
      payload: withShots,
      updatedAt: withShots.updatedAt,
    },
  ];
  if (withShots.outcome.status !== 'in_progress') {
    const { refreshLeaguePlayerStats } = await import('@/features/stats/services/stats.service');
    await refreshLeaguePlayerStats(withShots.leagueId);
    for (const player of getStore().players.filter((p) => p.leagueId === withShots.leagueId)) {
      syncItems.push({
        entity: 'player',
        docId: player.id,
        leagueId: player.leagueId,
        action: 'upsert',
        payload: player,
        updatedAt: player.updatedAt,
      });
    }
  }
  await scheduleSync(syncItems);
  logger.info('shot.service', 'Live frame completed', { matchId, winner });
  return withShots;
}

export async function undoLastFrame(matchId: string): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  const last = match.frames[match.frames.length - 1];
  if (!last) {
    throw new AppError('INVALID_STATE', 'No frame to undo');
  }
  const shots = last.shots ?? [];
  const open =
    shots.length > 0
      ? replayOpenFrame(shots, 'a', { a: match.teamA, b: match.teamB })
      : emptyOpenFrame(
          last.winner,
          (last.winner === 'a' ? match.teamA[0] : match.teamB[0]) ?? null,
        );
  const { deleteFrame } = await import('@/features/match/services/match.service');
  const after = await deleteFrame(matchId, match.frames.length - 1);
  const restored = await writeOpenFrame(after, open);
  logger.info('shot.service', 'Last frame undone', { matchId });
  return restored;
}

export function shotKindLabel(kind: ShotKind): string {
  if (kind === 'free_ball') {
    return 'Free ball';
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
