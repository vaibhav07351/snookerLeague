import { z } from 'zod';

import {
  highestBreakFromShots,
  newOpenFrame,
  nextBreakerSide,
  otherSide,
  replayOpenFrame,
  teamsOf,
} from '@/features/match/services/frame-engine';
import {
  loadMatchContext,
  requireEditor,
  requireInProgress,
  requireScorer,
  serializeMatchWrite,
} from '@/features/match/services/match-guards';
import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, type ScheduleItem } from '@/shared/sync';
import { joinSide } from '@/shared/utils/names';
import {
  FULL_RACK_REDS,
  leagueKindOf,
  type FeedEvent,
  type FrameScore,
  type Match,
  type MatchOutcome,
  type OpenFrame,
  type TeamChampions,
} from '@/shared/types/domain';

const createMatchSchema = z.object({
  leagueId: z.string().min(1),
  createdByUid: z.string().min(1),
  format: z.enum(['singles', 'doubles']),
  teamA: z.array(z.string().min(1)).min(1).max(2),
  teamB: z.array(z.string().min(1)).min(1).max(2),
  bestOf: z.number().int().min(1).max(35),
  namedLabel: z.string().trim().max(40).nullable(),
  crownsChampion: z.boolean(),
});

const framePointsSchema = z.number().int().min(0).max(1000);

export function framesToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/** True if `side` can still reach the frames needed to win. */
function sideCanStillWin(
  bestOf: number,
  framesA: number,
  framesB: number,
  side: 'a' | 'b',
): boolean {
  const need = framesToWin(bestOf);
  const own = side === 'a' ? framesA : framesB;
  const remaining = Math.max(0, bestOf - framesA - framesB);
  return own + remaining >= need;
}

function validateSides(format: 'singles' | 'doubles', teamA: string[], teamB: string[]): void {
  const expected = format === 'singles' ? 1 : 2;
  if (teamA.length !== expected || teamB.length !== expected) {
    throw new AppError(
      'VALIDATION',
      format === 'singles'
        ? 'Singles needs one player per side'
        : 'Doubles needs two players per side',
    );
  }
  const all = [...teamA, ...teamB];
  if (new Set(all).size !== all.length) {
    throw new AppError(
      'VALIDATION',
      format === 'singles' ? 'Pick two different players' : 'Pick four different players',
    );
  }
}

export function matchFormatOf(match: Match): 'singles' | 'doubles' {
  if (match.format === 'singles' || match.format === 'doubles') {
    return match.format;
  }
  return match.teamA.length === 1 && match.teamB.length === 1 ? 'singles' : 'doubles';
}

export async function listMatches(
  leagueId: string,
  opts?: { limit?: number; offset?: number },
): Promise<Match[]> {
  await loadStore();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return getStore()
    .matches.filter((m) => m.leagueId === leagueId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(offset, offset + limit);
}

export async function listLiveMatches(leagueId: string): Promise<Match[]> {
  await loadStore();
  return getStore()
    .matches.filter((m) => m.leagueId === leagueId && m.outcome.status === 'in_progress')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
}

export async function getMatch(matchId: string): Promise<Match | null> {
  await loadStore();
  return getStore().matches.find((m) => m.id === matchId) ?? null;
}

export async function createMatch(input: {
  leagueId: string;
  createdByUid: string;
  format: 'singles' | 'doubles';
  teamA: string[];
  teamB: string[];
  bestOf: number;
  namedLabel: string | null;
  crownsChampion: boolean;
}): Promise<Match> {
  const parsed = createMatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid match setup');
  }
  validateSides(parsed.data.format, parsed.data.teamA, parsed.data.teamB);

  const now = nowIso();
  const teams = { a: parsed.data.teamA, b: parsed.data.teamB };
  const match: Match = {
    id: createId('mt'),
    leagueId: parsed.data.leagueId,
    createdAt: now,
    updatedAt: now,
    createdByUid: parsed.data.createdByUid,
    format: parsed.data.format,
    teamA: parsed.data.teamA,
    teamB: parsed.data.teamB,
    bestOf: parsed.data.bestOf,
    namedLabel: parsed.data.namedLabel,
    crownsChampion: parsed.data.crownsChampion,
    frames: [],
    outcome: { status: 'in_progress', framesA: 0, framesB: 0 },
    // Frame clock is on by default and starts on the first shot of each frame.
    timingEnabled: true,
    frameStartedAt: null,
    openFrame: newOpenFrame('a', teams),
    scorerUid: parsed.data.createdByUid,
    scoringPolicy: 'anyone',
  };

  await updateStore((s) => ({ ...s, matches: [...s.matches, match] }));
  await scheduleSync([matchSyncItem(match)]);
  logger.info('match.service', 'Match created', { matchId: match.id });
  return match;
}

export function tallyFromFrames(frames: FrameScore[]): { framesA: number; framesB: number } {
  return frames.reduce(
    (acc, f) => ({
      framesA: acc.framesA + (f.winner === 'a' ? 1 : 0),
      framesB: acc.framesB + (f.winner === 'b' ? 1 : 0),
    }),
    { framesA: 0, framesB: 0 },
  );
}

/** Outcome from the frame list; keeps a forfeit when the clinching frame was a forfeit. */
function outcomeFromFrames(match: Match, frames: FrameScore[]): MatchOutcome {
  const tally = tallyFromFrames(frames);
  const need = framesToWin(match.bestOf);
  const clinchedA = tally.framesA >= need;
  const clinchedB = tally.framesB >= need;
  if (!clinchedA && !clinchedB) {
    return { status: 'in_progress', ...tally };
  }

  const winner: 'a' | 'b' = clinchedA ? 'a' : 'b';
  const last = frames[frames.length - 1];
  if (last?.viaForfeit && last.winner === winner) {
    const prior = tallyFromFrames(frames.slice(0, -1));
    return {
      status: 'forfeited',
      winner,
      forfeitedBy: otherSide(winner),
      framesA: tally.framesA,
      framesB: tally.framesB,
      scoreAtForfeit: {
        framesA: prior.framesA,
        framesB: prior.framesB,
        framePointsA: last.teamAPoints,
        framePointsB: last.teamBPoints,
      },
    };
  }

  return { status: 'completed', winner, ...tally };
}

function latestTeamChampions(matches: Match[], leagueId: string): TeamChampions | null {
  const crowned = matches
    .filter((m) => m.leagueId === leagueId && m.crownsChampion)
    .filter((m) => m.outcome.status === 'completed' || m.outcome.status === 'forfeited')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!crowned || crowned.outcome.status === 'in_progress') {
    return null;
  }
  return {
    playerIds: crowned.outcome.winner === 'a' ? crowned.teamA : crowned.teamB,
    matchId: crowned.id,
    namedLabel: crowned.namedLabel,
    crownedAt: crowned.updatedAt,
  };
}

export function matchSyncItem(match: Match): ScheduleItem {
  return {
    entity: 'match',
    docId: match.id,
    leagueId: match.leagueId,
    action: 'upsert',
    payload: match,
    updatedAt: match.updatedAt,
  };
}

/**
 * Save a match whose result may have changed (or delete it), then recompute league-wide
 * derived data (reigning champions, player stats) and queue every changed doc for sync.
 */
export async function persistMatchResult(
  match: Match,
  opts: { event?: FeedEvent; deleted?: boolean } = {},
): Promise<Match> {
  const { event, deleted = false } = opts;
  await updateStore((s) => {
    const matches = deleted
      ? s.matches.filter((m) => m.id !== match.id)
      : s.matches.map((m) => (m.id === match.id ? match : m));
    const leagues = s.leagues.map((l) =>
      l.id === match.leagueId
        ? { ...l, reigningTeam: latestTeamChampions(matches, l.id), updatedAt: nowIso() }
        : l,
    );
    const events = event ? [...s.events, { ...event, updatedAt: event.updatedAt }] : s.events;
    // Derived stats: not an edit of the player, so no updatedAt bump.
    const players = applyPlayerStats(s.players, match.leagueId, matches, s.races);
    return { ...s, matches, leagues, events, players };
  });

  const store = getStore();
  const league = store.leagues.find((l) => l.id === match.leagueId) ?? null;
  const leaguePlayers = store.players.filter((p) => p.leagueId === match.leagueId);

  const items: ScheduleItem[] = [
    deleted
      ? {
          entity: 'match',
          docId: match.id,
          leagueId: match.leagueId,
          action: 'delete',
          payload: null,
          updatedAt: nowIso(),
        }
      : matchSyncItem(match),
  ];
  if (league) {
    items.push({
      entity: 'league',
      docId: league.id,
      leagueId: null,
      action: 'upsert',
      payload: league,
      updatedAt: league.updatedAt,
      fieldsOnly: ['reigningTeam', 'updatedAt'],
    });
  }
  if (event) {
    items.push({
      entity: 'event',
      docId: event.id,
      leagueId: event.leagueId,
      action: 'upsert',
      payload: event,
      updatedAt: event.updatedAt,
    });
  }
  for (const player of leaguePlayers) {
    items.push({
      entity: 'player',
      docId: player.id,
      leagueId: player.leagueId,
      action: 'upsert',
      payload: player,
      updatedAt: player.updatedAt,
      // Derived stats only: never overwrite a name or owner from this phone's copy.
      fieldsOnly: ['stats'],
    });
  }
  await scheduleSync(items);

  if (league && leagueKindOf(league) === 'city') {
    const { syncCityRankFromHub } = await import('@/features/community/services/profile.service');
    for (const player of leaguePlayers) {
      if (player.authUid) {
        await syncCityRankFromHub(player.authUid, league.id);
      }
    }
  }
  return match;
}

/** Seconds since the frame clock started, when timing is on and the clock is running. */
function durationFromTimer(match: Match): number | undefined {
  if (!match.timingEnabled || !match.frameStartedAt) {
    return undefined;
  }
  const started = Date.parse(match.frameStartedAt);
  if (Number.isNaN(started)) {
    return undefined;
  }
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

/** The match after a frame list change: outcome, next open frame and clock reset. */
function withFrames(match: Match, frames: FrameScore[], outcome: MatchOutcome): Match {
  const inProgress = outcome.status === 'in_progress';
  return {
    ...match,
    frames,
    outcome,
    // The next frame's clock starts on its first shot.
    frameStartedAt: null,
    openFrame: inProgress ? newOpenFrame(nextBreakerSide(frames), teamsOf(match)) : null,
    updatedAt: nowIso(),
  };
}

function matchWonEvent(match: Match, updatedAt: string): FeedEvent {
  return {
    id: createId('ev'),
    leagueId: match.leagueId,
    type: match.crownsChampion ? 'team_crowned' : 'match_won',
    createdAt: updatedAt,
    updatedAt,
    title: match.crownsChampion ? 'New reigning champions' : 'Match complete',
    body: match.namedLabel ?? `Best of ${match.bestOf}`,
    relatedIds: [...match.teamA, ...match.teamB, match.id],
  };
}

/** Frame record built from the live frame (shots, breaks, table seed, carried points). */
function liveFrameFields(live: OpenFrame | undefined): Partial<FrameScore> {
  if (!live) {
    return {};
  }
  return {
    ...(live.shots.length > 0
      ? {
          shots: live.shots,
          highestBreakA: highestBreakFromShots(live.shots, 'a'),
          highestBreakB: highestBreakFromShots(live.shots, 'b'),
        }
      : {}),
    // A frame joined mid-way does not know who broke off; the loser then breaks next.
    ...(live.breakerSide && !live.carriedPoints ? { breakerSide: live.breakerSide } : {}),
    ...(live.carriedPoints ? { carriedPoints: live.carriedPoints } : {}),
    startingReds: live.startingReds ?? FULL_RACK_REDS,
    redsRemoved: live.redsRemoved ?? 0,
  };
}

/**
 * Close the current frame. With `live`, the live frame's shots are kept on the frame;
 * without it the frame is logged by final score only (any live shots are discarded).
 */
export function addFrame(
  matchId: string,
  frame: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b'; live?: OpenFrame },
): Promise<Match> {
  return serializeMatchWrite(matchId, () => addFrameNow(matchId, frame));
}

/** Unqueued addFrame, for callers already inside serializeMatchWrite. */
export async function addFrameNow(
  matchId: string,
  frame: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b'; live?: OpenFrame },
): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  requireScorer(ctx);
  const pointsA = framePointsSchema.safeParse(frame.teamAPoints);
  const pointsB = framePointsSchema.safeParse(frame.teamBPoints);
  if (!pointsA.success || !pointsB.success) {
    throw new AppError('VALIDATION', 'Frame points must be whole numbers from 0 to 1000');
  }
  const { match } = ctx;

  const durationSeconds = durationFromTimer(match);
  const scored: FrameScore = {
    teamAPoints: pointsA.data,
    teamBPoints: pointsB.data,
    winner: frame.winner,
    ...(frame.live
      ? liveFrameFields(frame.live)
      : match.openFrame?.breakerSide
        ? { breakerSide: match.openFrame.breakerSide }
        : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
  const frames = [...match.frames, scored];
  const outcome = outcomeFromFrames(match, frames);
  const updated = withFrames(match, frames, outcome);
  const event =
    outcome.status === 'completed' ? matchWonEvent(match, updated.updatedAt) : undefined;

  await persistMatchResult(updated, { event });
  logger.info('match.service', 'Frame added', { matchId, status: outcome.status });
  return updated;
}

/**
 * Award the current frame to the opponent via forfeit.
 * The match only ends (status `forfeited`) when after that frame the
 * forfeiting side can no longer reach the frames needed to win.
 */
export function forfeitFrame(matchId: string, forfeitedBy: 'a' | 'b'): Promise<Match> {
  return serializeMatchWrite(matchId, () => forfeitFrameNow(matchId, forfeitedBy));
}

async function forfeitFrameNow(matchId: string, forfeitedBy: 'a' | 'b'): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  requireScorer(ctx);
  const { match } = ctx;

  const live = match.openFrame ?? undefined;
  const framePointsA = live?.teamAPoints ?? 0;
  const framePointsB = live?.teamBPoints ?? 0;
  const prior = tallyFromFrames(match.frames);
  const frameWinner = otherSide(forfeitedBy);
  const durationSeconds = durationFromTimer(match);

  const frames: FrameScore[] = [
    ...match.frames,
    {
      teamAPoints: framePointsA,
      teamBPoints: framePointsB,
      winner: frameWinner,
      viaForfeit: true,
      ...liveFrameFields(live),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    },
  ];
  const tally = tallyFromFrames(frames);
  const matchOver = !sideCanStillWin(match.bestOf, tally.framesA, tally.framesB, forfeitedBy);

  let outcome: MatchOutcome;
  let event: FeedEvent | undefined;
  const updatedAt = nowIso();
  if (matchOver) {
    outcome = {
      status: 'forfeited',
      winner: frameWinner,
      forfeitedBy,
      framesA: tally.framesA,
      framesB: tally.framesB,
      scoreAtForfeit: {
        framesA: prior.framesA,
        framesB: prior.framesB,
        framePointsA,
        framePointsB,
      },
    };
    const pointsPart =
      framePointsA > 0 || framePointsB > 0 ? ` · frame ${framePointsA}-${framePointsB}` : '';
    event = {
      id: createId('ev'),
      leagueId: match.leagueId,
      type: match.crownsChampion ? 'team_crowned' : 'match_won',
      createdAt: updatedAt,
      updatedAt,
      title: match.crownsChampion ? 'Champions by forfeit' : 'Win by forfeit',
      body: `Frame forfeit locked the match ${tally.framesA}-${tally.framesB}${pointsPart}`,
      relatedIds: [...match.teamA, ...match.teamB, match.id],
    };
  } else {
    // A side that can still win cannot have clinched it here either.
    outcome = outcomeFromFrames(match, frames);
  }

  const updated = withFrames(match, frames, outcome);
  await persistMatchResult(updated, { event });
  logger.info('match.service', 'Frame forfeited', { matchId, forfeitedBy, matchOver });
  return updated;
}

/** Apply an edited frame list: recompute outcome; reopen the match if the clinch is undone. */
async function applyFrameListChange(match: Match, frames: FrameScore[]): Promise<Match> {
  const outcome = outcomeFromFrames(match, frames);
  const wasInProgress = match.outcome.status === 'in_progress';
  const stillInProgress = outcome.status === 'in_progress';
  // Keep the live frame untouched when the match was and still is in progress.
  const updated: Match =
    wasInProgress && stillInProgress && match.openFrame
      ? { ...match, frames, outcome, updatedAt: nowIso() }
      : withFrames(match, frames, outcome);
  await persistMatchResult(updated);
  return updated;
}

/** Edit an existing frame (points / winner). Reopens the match if the clinch is undone. */
export function updateFrame(
  matchId: string,
  frameIndex: number,
  patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b'; viaForfeit?: boolean },
): Promise<Match> {
  return serializeMatchWrite(matchId, () => updateFrameNow(matchId, frameIndex, patch));
}

async function updateFrameNow(
  matchId: string,
  frameIndex: number,
  patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b'; viaForfeit?: boolean },
): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireEditor(ctx);
  const { match } = ctx;
  const prev = match.frames[frameIndex];
  if (!prev) {
    throw new AppError('VALIDATION', 'Frame not found');
  }
  const pointsA = framePointsSchema.safeParse(Math.floor(patch.teamAPoints));
  const pointsB = framePointsSchema.safeParse(Math.floor(patch.teamBPoints));
  if (!pointsA.success || !pointsB.success) {
    throw new AppError('VALIDATION', 'Frame points must be whole numbers from 0 to 1000');
  }
  const frames = match.frames.map((f, i) =>
    i === frameIndex
      ? {
          ...f,
          teamAPoints: pointsA.data,
          teamBPoints: pointsB.data,
          winner: patch.winner,
          viaForfeit: patch.viaForfeit ?? prev.viaForfeit,
        }
      : f,
  );
  const updated = await applyFrameListChange(match, frames);
  logger.info('match.service', 'Frame updated', { matchId, frameIndex });
  return updated;
}

/** Delete a frame. Reopens the match if the clinch is undone. */
export function deleteFrame(matchId: string, frameIndex: number): Promise<Match> {
  return serializeMatchWrite(matchId, () => deleteFrameNow(matchId, frameIndex));
}

async function deleteFrameNow(matchId: string, frameIndex: number): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireEditor(ctx);
  if (frameIndex < 0 || frameIndex >= ctx.match.frames.length) {
    throw new AppError('VALIDATION', 'Frame not found');
  }
  const frames = ctx.match.frames.filter((_, i) => i !== frameIndex);
  const updated = await applyFrameListChange(ctx.match, frames);
  logger.info('match.service', 'Frame deleted', { matchId, frameIndex });
  return updated;
}

/** Remove the auto-saved duration from a frame (keeps the frame result). */
export function clearFrameDuration(matchId: string, frameIndex: number): Promise<Match> {
  return serializeMatchWrite(matchId, () => clearFrameDurationNow(matchId, frameIndex));
}

async function clearFrameDurationNow(matchId: string, frameIndex: number): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireEditor(ctx);
  if (frameIndex < 0 || frameIndex >= ctx.match.frames.length) {
    throw new AppError('VALIDATION', 'Frame not found');
  }
  const frames = ctx.match.frames.map((f, i) => {
    if (i !== frameIndex) {
      return f;
    }
    const { durationSeconds: _removed, ...rest } = f;
    return rest;
  });
  const updated: Match = { ...ctx.match, frames, updatedAt: nowIso() };
  await persistMatchResult(updated);
  logger.info('match.service', 'Frame duration cleared', { matchId, frameIndex });
  return updated;
}

/**
 * Put the last finished frame back on the table so scoring can continue from it.
 * Ball-by-ball frames are replayed from their shots; final-score frames come back as
 * carried-in points. The current live frame must be empty (the UI checks first).
 */
export function reopenLastFrame(matchId: string): Promise<Match> {
  return serializeMatchWrite(matchId, () => reopenLastFrameNow(matchId));
}

async function reopenLastFrameNow(matchId: string): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireScorer(ctx);
  const { match } = ctx;
  const last = match.frames[match.frames.length - 1];
  if (!last) {
    throw new AppError('INVALID_STATE', 'No frame to undo');
  }
  if ((match.openFrame?.shots.length ?? 0) > 0) {
    throw new AppError('INVALID_STATE', 'Undo the shots in the current frame first');
  }
  const frames = match.frames.slice(0, -1);
  const teams = teamsOf(match);
  const shots = last.shots ?? [];
  const breakerSide = last.breakerSide ?? shots[0]?.side ?? otherSide(last.winner);
  const carriedPoints =
    shots.length > 0
      ? last.carriedPoints
      : last.carriedOver
        ? undefined
        : { a: last.teamAPoints, b: last.teamBPoints };
  const openFrame = replayOpenFrame(
    shots,
    {
      breakerSide,
      breakerPlayerId: shots[0]?.playerId ?? null,
      startingReds: last.startingReds ?? FULL_RACK_REDS,
      redsRemoved: last.redsRemoved ?? 0,
      ...(carriedPoints && (carriedPoints.a > 0 || carriedPoints.b > 0) ? { carriedPoints } : {}),
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
  logger.info('match.service', 'Last frame reopened', { matchId });
  return updated;
}

export function setMatchTiming(matchId: string, enabled: boolean): Promise<Match> {
  return serializeMatchWrite(matchId, () => setMatchTimingNow(matchId, enabled));
}

async function setMatchTimingNow(matchId: string, enabled: boolean): Promise<Match> {
  const ctx = await loadMatchContext(matchId);
  requireInProgress(ctx.match);
  requireScorer(ctx);
  const { match } = ctx;
  const frameUnderway = (match.openFrame?.shots.length ?? 0) > 0;
  const updated: Match = {
    ...match,
    timingEnabled: enabled,
    // Turned on mid-frame: start now. Before the first shot: start on the first shot.
    frameStartedAt: enabled && frameUnderway ? nowIso() : null,
    updatedAt: nowIso(),
  };
  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === matchId ? updated : m)),
  }));
  await scheduleSync([matchSyncItem(updated)]);
  logger.info('match.service', 'Timing toggled', { matchId, enabled });
  return updated;
}

/** Most recent match activity in the league (any logged match). */
export async function getLastMatchPlayedAt(leagueId: string): Promise<string | null> {
  await loadStore();
  const latest = getStore()
    .matches.filter((m) => m.leagueId === leagueId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.updatedAt ?? null;
}

export function playerNamesForMatch(
  match: Match,
  nameOf: (id: string) => string,
): { teamA: string; teamB: string } {
  return { teamA: joinSide(match.teamA, nameOf), teamB: joinSide(match.teamB, nameOf) };
}

export function describeForfeit(match: Match, nameOf: (id: string) => string): string | null {
  if (match.outcome.status !== 'forfeited') {
    return null;
  }
  const labels = playerNamesForMatch(match, nameOf);
  const quitters = match.outcome.forfeitedBy === 'a' ? labels.teamA : labels.teamB;
  const winners = match.outcome.winner === 'a' ? labels.teamA : labels.teamB;
  const frames = `${match.outcome.scoreAtForfeit.framesA}-${match.outcome.scoreAtForfeit.framesB}`;
  const ptsA = match.outcome.scoreAtForfeit.framePointsA ?? 0;
  const ptsB = match.outcome.scoreAtForfeit.framePointsB ?? 0;
  const pointsPart = ptsA > 0 || ptsB > 0 ? ` (frame points ${ptsA}-${ptsB})` : '';
  return `${quitters} forfeited a frame at ${frames}${pointsPart} · ${winners} win the match`;
}
