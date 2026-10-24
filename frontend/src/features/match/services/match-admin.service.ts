import { z } from 'zod';

import { replayOpenFrame, teamsOf } from '@/features/match/services/frame-engine';
import { canTakeOverScoring } from '@/features/match/services/match-access';
import {
  loadMatchContext,
  requireInProgress,
  requireManager,
  requireScorer,
  serializeMatchWrite,
} from '@/features/match/services/match-guards';
import {
  framesToWin,
  persistMatchResult,
  tallyFromFrames,
} from '@/features/match/services/match.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { nowIso } from '@/shared/utils/id';
import { updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import {
  FULL_RACK_REDS,
  type FrameScore,
  type Match,
  type ScoringPolicy,
} from '@/shared/types/domain';

type SettingsPatch = Partial<
  Pick<Match, 'scorerUid' | 'scoringPolicy' | 'allowedScorerUids' | 'crownsChampion'>
>;

/**
 * Save match settings on their own (only these fields go to the server, stamped with
 * settingsUpdatedAt), so they never overwrite the scorer's shots and the scorer's saves
 * never undo them.
 */
async function saveSettings(match: Match, patch: SettingsPatch): Promise<Match> {
  const stamp = nowIso();
  const updated: Match = { ...match, ...patch, settingsUpdatedAt: stamp, updatedAt: stamp };
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
      fieldsOnly: [...Object.keys(patch), 'settingsUpdatedAt', 'updatedAt'],
    },
  ]);
  return updated;
}

/**
 * Become the scorer. Only `scorerUid` changes, which is also the one change Firestore rules
 * let a non-scoring member make, so the hand-over works without the old scorer's phone.
 */
export function takeOverScoring(matchId: string): Promise<Match> {
  return serializeMatchWrite(matchId, () => takeOverScoringNow(matchId));
}

async function takeOverScoringNow(matchId: string): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  if (!ctx.uid) {
    throw new AppError('AUTH', 'Sign in to score');
  }
  if (!canTakeOverScoring(ctx.match, ctx.league, ctx.uid)) {
    throw new AppError('FORBIDDEN', 'The match creator has limited who can score this match');
  }
  const updated = await saveSettings(ctx.match, { scorerUid: ctx.uid });
  logger.info('match-admin', 'Scoring taken over', { matchId });
  return updated;
}

const policySchema = z.object({
  policy: z.enum(['anyone', 'chosen']),
  allowedScorerUids: z.array(z.string().min(1)).max(50),
});

export async function setScoringPolicy(
  matchId: string,
  policy: ScoringPolicy,
  allowedScorerUids: string[] = [],
): Promise<Match> {
  const parsed = policySchema.safeParse({ policy, allowedScorerUids });
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid scoring settings');
  }
  return serializeMatchWrite(matchId, async () => {
    const ctx = await loadMatchContext(matchId);
    requireManager(ctx);
    return saveSettings(ctx.match, {
      scoringPolicy: parsed.data.policy,
      allowedScorerUids: [...new Set(parsed.data.allowedScorerUids)],
    });
  }).then((updated) => {
    logger.info('match-admin', 'Scoring policy set', { matchId, policy });
    return updated;
  });
}

/** Make a running match a title match (the winner takes the league crown), or undo that. */
export function setTitleMatch(matchId: string, crownsChampion: boolean): Promise<Match> {
  return serializeMatchWrite(matchId, async () => {
    const ctx = await loadMatchContext(matchId);
    requireInProgress(ctx.match);
    requireManager(ctx);
    const updated = await saveSettings(ctx.match, { crownsChampion });
    logger.info('match-admin', 'Title match toggled', { matchId, crownsChampion });
    return updated;
  });
}

/**
 * Abandon and delete a match. Stats and the reigning champions are recomputed without it,
 * and the delete is synced so it disappears on every device.
 */
export function deleteMatch(matchId: string): Promise<void> {
  return serializeMatchWrite(matchId, async () => {
    const ctx = await loadMatchContext(matchId);
    requireManager(ctx);
    await persistMatchResult(ctx.match, { deleted: true });
    logger.info('match-admin', 'Match deleted', { matchId });
  });
}

const midwaySchema = z.object({
  framesA: z.number().int().min(0).max(17),
  framesB: z.number().int().min(0).max(17),
  pointsA: z.number().int().min(0).max(200),
  pointsB: z.number().int().min(0).max(200),
  redsLeft: z.number().int().min(0).max(FULL_RACK_REDS),
  atTable: z.enum(['a', 'b']),
});

export type MidwayInput = z.infer<typeof midwaySchema>;

/**
 * Started using the app part-way through a match: record the frames already won and the
 * score of the frame in progress, then carry on ball by ball from there.
 * Only allowed before anything has been logged in this match.
 */
export function startFromCurrentScore(matchId: string, input: MidwayInput): Promise<Match> {
  return serializeMatchWrite(matchId, () => startFromCurrentScoreNow(matchId, input));
}

async function startFromCurrentScoreNow(matchId: string, input: MidwayInput): Promise<Match> {
  const parsed = midwaySchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Check the scores: frames and points must be whole numbers');
  }
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  requireScorer(ctx);
  const { match } = ctx;
  if (match.frames.length > 0 || (match.openFrame?.shots.length ?? 0) > 0) {
    throw new AppError('INVALID_STATE', 'Scoring has already started in this match');
  }
  const { framesA, framesB, pointsA, pointsB, redsLeft, atTable } = parsed.data;
  const need = framesToWin(match.bestOf);
  if (framesA >= need || framesB >= need || framesA + framesB >= match.bestOf) {
    throw new AppError(
      'VALIDATION',
      `In a best of ${match.bestOf}, nobody can have ${need} frames yet`,
    );
  }

  const carried = (winner: 'a' | 'b'): FrameScore => ({
    teamAPoints: 0,
    teamBPoints: 0,
    winner,
    carriedOver: true,
  });
  const frames: FrameScore[] = [
    ...Array.from({ length: framesA }, () => carried('a')),
    ...Array.from({ length: framesB }, () => carried('b')),
  ];
  const teams = teamsOf(match);
  const openFrame = replayOpenFrame(
    [],
    {
      breakerSide: atTable,
      breakerPlayerId: teams[atTable][0] ?? null,
      startingReds: redsLeft,
      redsRemoved: 0,
      ...(pointsA > 0 || pointsB > 0 ? { carriedPoints: { a: pointsA, b: pointsB } } : {}),
    },
    teams,
  );
  const updated: Match = {
    ...match,
    frames,
    outcome: { status: 'in_progress', ...tallyFromFrames(frames) },
    openFrame,
    frameStartedAt: null,
    updatedAt: nowIso(),
  };
  await persistMatchResult(updated);
  logger.info('match-admin', 'Match started mid-way', { matchId, framesA, framesB, redsLeft });
  return updated;
}
