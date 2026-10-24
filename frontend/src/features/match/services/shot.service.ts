import { z } from 'zod';

import { frameSeedOf, replayOpenFrame, teamsOf } from '@/features/match/services/frame-engine';
import {
  loadMatchContext,
  requireInProgress,
  requireScorer,
  serializeMatchWrite,
} from '@/features/match/services/match-guards';
import { freeBallValue, tableStateOf } from '@/features/match/services/table-state';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import {
  FULL_RACK_REDS,
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

const shotInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pot'), ball: ballSchema }),
  z.object({ kind: z.literal('foul'), points: z.number().int().min(4).max(7) }),
  z.object({ kind: z.literal('miss') }),
  z.object({ kind: z.literal('safety') }),
  z.object({ kind: z.literal('free_ball'), ball: ballSchema.optional() }),
]);

export type ShotInput = z.infer<typeof shotInputSchema>;

/** Load a match that is still being played and that the signed-in user is scoring. */
async function loadScorableMatch(matchId: string): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  requireScorer(ctx);
  return ctx.match;
}

function openFrameOf(match: Match): OpenFrame {
  if (match.openFrame) {
    return match.openFrame;
  }
  return replayOpenFrame(
    [],
    {
      breakerSide: 'a',
      breakerPlayerId: match.teamA[0] ?? null,
      startingReds: FULL_RACK_REDS,
      redsRemoved: 0,
    },
    teamsOf(match),
  );
}

async function writeMatch(updated: Match): Promise<Match> {
  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === updated.id ? updated : m)),
  }));
  // Not awaited: the next tap must not wait for the server. Firestore keeps one client's
  // writes in order, and failures are queued and retried by the sync layer.
  void scheduleSync([
    {
      entity: 'match',
      docId: updated.id,
      leagueId: updated.leagueId,
      action: 'upsert',
      payload: updated,
      updatedAt: updated.updatedAt,
    },
  ]).catch((error: unknown) => {
    logger.error('shot.service', 'Sync scheduling failed', {
      matchId: updated.id,
      shape: error instanceof Error ? error.name : 'unknown',
    });
  });
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

function shooterFor(match: Match, open: OpenFrame): string | null {
  const side = open.atTable;
  if (open.atTablePlayerId && teamForPlayer(match, open.atTablePlayerId) === side) {
    return open.atTablePlayerId;
  }
  const last = open.lastPlayerIdBySide?.[side];
  if (last && teamForPlayer(match, last) === side) {
    return last;
  }
  return (side === 'a' ? match.teamA[0] : match.teamB[0]) ?? null;
}

function buildShot(match: Match, open: OpenFrame, input: ShotInput): Shot {
  const base = {
    id: createId('sh'),
    at: nowIso(),
    side: open.atTable,
    playerId: shooterFor(match, open),
  };
  switch (input.kind) {
    case 'pot':
      return { ...base, kind: 'pot', points: input.ball, ball: input.ball };
    case 'foul':
      return { ...base, kind: 'foul', points: input.points };
    case 'free_ball': {
      // A free ball is worth the ball on (1 while reds remain, else the colour in sequence).
      const ball = input.ball ?? freeBallValue(tableStateOf(open));
      return { ...base, kind: 'free_ball', points: ball, ball };
    }
    case 'miss':
    case 'safety':
      return { ...base, kind: input.kind, points: 0 };
  }
}

/** Set the player at the table. Before the first shot this also changes who breaks off. */
export function setAtTablePlayer(matchId: string, playerId: string): Promise<Match> {
  return serializeMatchWrite(matchId, () => setAtTablePlayerNow(matchId, playerId));
}

async function setAtTablePlayerNow(matchId: string, playerId: string): Promise<Match> {
  const match = await loadScorableMatch(matchId);
  const side = teamForPlayer(match, playerId);
  if (!side) {
    throw new AppError('VALIDATION', 'Player is not in this match');
  }
  const open = openFrameOf(match);
  let next: OpenFrame;
  if (open.shots.length === 0) {
    next = replayOpenFrame(
      [],
      { ...frameSeedOf(open), breakerSide: side, breakerPlayerId: playerId },
      teamsOf(match),
    );
  } else {
    const sameVisit = open.atTable === side && open.atTablePlayerId === playerId;
    next = {
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
  }
  const updated = await writeMatch({ ...match, openFrame: next, updatedAt: nowIso() });
  logger.info('shot.service', 'At-table player set', { matchId, side });
  return updated;
}

export function recordShot(matchId: string, input: ShotInput): Promise<Match> {
  return serializeMatchWrite(matchId, () => recordShotNow(matchId, input));
}

async function recordShotNow(matchId: string, input: ShotInput): Promise<Match> {
  const parsed = shotInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid shot');
  }
  const match = await loadScorableMatch(matchId);
  const open = openFrameOf(match);
  const shot = buildShot(match, open, parsed.data);
  const next = replayOpenFrame([...open.shots, shot], frameSeedOf(open), teamsOf(match));
  // Frame clock starts automatically on the first thing logged in the frame.
  const startClock = match.timingEnabled === true && !match.frameStartedAt;
  const updated = await writeMatch({
    ...match,
    openFrame: next,
    ...(startClock ? { frameStartedAt: shot.at } : {}),
    updatedAt: nowIso(),
  });
  logger.info('shot.service', 'Shot recorded', { matchId, kind: shot.kind });
  return updated;
}

export function undoLastShot(matchId: string): Promise<Match> {
  return serializeMatchWrite(matchId, () => undoLastShotNow(matchId));
}

async function undoLastShotNow(matchId: string): Promise<Match> {
  const match = await loadScorableMatch(matchId);
  const open = match.openFrame;
  if (!open || open.shots.length === 0) {
    throw new AppError('INVALID_STATE', 'No shot to undo');
  }
  const shots = open.shots.slice(0, -1);
  const next = replayOpenFrame(shots, frameSeedOf(open), teamsOf(match));
  return writeMatch({
    ...match,
    openFrame: next,
    // Undoing the first shot also resets the frame clock to "starts on first shot".
    ...(shots.length === 0 ? { frameStartedAt: null } : {}),
    updatedAt: nowIso(),
  });
}

/** Finish the live frame: its points, shots and breaks are saved on the frame in one write. */
export function completeLiveFrame(matchId: string, winner: 'a' | 'b'): Promise<Match> {
  return serializeMatchWrite(matchId, () => completeLiveFrameNow(matchId, winner));
}

async function completeLiveFrameNow(matchId: string, winner: 'a' | 'b'): Promise<Match> {
  const match = await loadScorableMatch(matchId);
  const open = openFrameOf(match);
  const { addFrameNow } = await import('@/features/match/services/match.service');
  const updated = await addFrameNow(matchId, {
    teamAPoints: open.teamAPoints,
    teamBPoints: open.teamBPoints,
    winner,
    live: open,
  });
  logger.info('shot.service', 'Live frame completed', { matchId, winner });
  return updated;
}

/** Put the last finished frame back on the table, with its shots, to keep scoring it. */
export async function undoLastFrame(matchId: string): Promise<Match> {
  // reopenLastFrame queues itself behind any pending shot writes for this match.
  const { reopenLastFrame } = await import('@/features/match/services/match.service');
  return reopenLastFrame(matchId);
}

export function shotKindLabel(kind: ShotKind): string {
  if (kind === 'free_ball') {
    return 'Free ball';
  }
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
