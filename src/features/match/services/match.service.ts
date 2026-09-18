import { z } from 'zod';

import { applyPlayerStats } from '@/features/stats/services/stats.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, type ScheduleItem } from '@/shared/sync';
import type {
  FeedEvent,
  FrameScore,
  League,
  Match,
  MatchOutcome,
  TeamChampions,
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

function framesToWin(bestOf: number): number {
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
    timingEnabled: false,
    frameStartedAt: null,
  };

  await updateStore((s) => ({ ...s, matches: [...s.matches, match] }));
  await scheduleSync([
    {
      entity: 'match',
      docId: match.id,
      leagueId: match.leagueId,
      action: 'upsert',
      payload: match,
      updatedAt: match.updatedAt,
    },
  ]);
  logger.info('match.service', 'Match created', { matchId: match.id });
  return match;
}

function tallyFromFrames(frames: FrameScore[]): { framesA: number; framesB: number } {
  return frames.reduce(
    (acc, f) => ({
      framesA: acc.framesA + (f.winner === 'a' ? 1 : 0),
      framesB: acc.framesB + (f.winner === 'b' ? 1 : 0),
    }),
    { framesA: 0, framesB: 0 },
  );
}

function maybeComplete(match: Match, frames: FrameScore[]): MatchOutcome {
  const tally = tallyFromFrames(frames);
  const need = framesToWin(match.bestOf);
  if (tally.framesA >= need) {
    return { status: 'completed', winner: 'a', ...tally };
  }
  if (tally.framesB >= need) {
    return { status: 'completed', winner: 'b', ...tally };
  }
  return { status: 'in_progress', ...tally };
}

/** Recompute outcome after edit/delete; preserves forfeit if last frame was a clinching forfeit. */
function outcomeAfterFrameChange(match: Match, frames: FrameScore[]): MatchOutcome {
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
      forfeitedBy: winner === 'a' ? 'b' : 'a',
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

async function persistMatchResult(match: Match, event?: FeedEvent): Promise<Match> {
  let eventId: string | null = null;

  await updateStore((s) => {
    const matches = s.matches.map((m) => (m.id === match.id ? match : m));
    let events = s.events;

    const leagues = s.leagues.map((l) => {
      if (l.id !== match.leagueId) {
        return l;
      }
      return {
        ...l,
        reigningTeam: latestTeamChampions(matches, l.id),
        updatedAt: nowIso(),
      };
    });

    if (event) {
      const withTs: FeedEvent = {
        ...event,
        updatedAt: event.updatedAt ?? event.createdAt,
      };
      eventId = withTs.id;
      events = [...events, withTs];
    }

    const players = applyPlayerStats(s.players, match.leagueId, matches, s.races).map((p) =>
      p.leagueId === match.leagueId ? { ...p, updatedAt: nowIso() } : p,
    );

    return { ...s, matches, leagues, events, players };
  });

  const store = getStore();
  const syncedLeague = store.leagues.find((l) => l.id === match.leagueId) ?? null;
  const syncedEvent = eventId ? store.events.find((e) => e.id === eventId) : undefined;
  const syncedPlayers = store.players.filter((p) => p.leagueId === match.leagueId);

  const items: ScheduleItem[] = [
    {
      entity: 'match',
      docId: match.id,
      leagueId: match.leagueId,
      action: 'upsert',
      payload: match,
      updatedAt: match.updatedAt,
    },
  ];
  if (syncedLeague) {
    items.push({
      entity: 'league',
      docId: syncedLeague.id,
      leagueId: null,
      action: 'upsert',
      payload: syncedLeague,
      updatedAt: syncedLeague.updatedAt,
    });
  }
  if (syncedEvent) {
    items.push({
      entity: 'event',
      docId: syncedEvent.id,
      leagueId: syncedEvent.leagueId,
      action: 'upsert',
      payload: syncedEvent,
      updatedAt: syncedEvent.updatedAt,
    });
  }
  for (const player of syncedPlayers) {
    items.push({
      entity: 'player',
      docId: player.id,
      leagueId: player.leagueId,
      action: 'upsert',
      payload: player,
      updatedAt: player.updatedAt,
    });
  }
  await scheduleSync(items);
  return match;
}

async function applyFrameListChange(match: Match, frames: FrameScore[]): Promise<Match> {
  const outcome = outcomeAfterFrameChange(match, frames);
  const stillInProgress = outcome.status === 'in_progress';
  const updated: Match = {
    ...match,
    frames,
    outcome,
    timingEnabled: stillInProgress ? match.timingEnabled === true : false,
    frameStartedAt:
      stillInProgress && match.timingEnabled === true ? (match.frameStartedAt ?? nowIso()) : null,
    updatedAt: nowIso(),
  };
  await persistMatchResult(updated);
  return updated;
}

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

function nextFrameTimer(
  match: Match,
  stillInProgress: boolean,
): {
  timingEnabled: boolean;
  frameStartedAt: string | null;
} {
  const timingEnabled = match.timingEnabled === true;
  if (!timingEnabled || !stillInProgress) {
    return { timingEnabled, frameStartedAt: null };
  }
  return { timingEnabled, frameStartedAt: nowIso() };
}

/** Most recent match activity in the league (any logged match). */
export async function getLastMatchPlayedAt(leagueId: string): Promise<string | null> {
  await loadStore();
  const latest = getStore()
    .matches.filter((m) => m.leagueId === leagueId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.updatedAt ?? null;
}

export async function setMatchTiming(matchId: string, enabled: boolean): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (match.outcome.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }

  const updated: Match = {
    ...match,
    timingEnabled: enabled,
    frameStartedAt: enabled ? nowIso() : null,
    updatedAt: nowIso(),
  };

  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === matchId ? updated : m)),
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
  logger.info('match.service', 'Timing toggled', { matchId, enabled });
  return updated;
}

/** Remove auto-saved duration from a frame (keep the frame result). */
export async function clearFrameDuration(matchId: string, frameIndex: number): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (frameIndex < 0 || frameIndex >= match.frames.length) {
    throw new AppError('VALIDATION', 'Frame not found');
  }

  const frames = match.frames.map((f, i) => {
    if (i !== frameIndex) {
      return f;
    }
    const { durationSeconds: _removed, ...rest } = f;
    return rest;
  });

  const updated: Match = {
    ...match,
    frames,
    updatedAt: nowIso(),
  };

  await updateStore((s) => {
    const matches = s.matches.map((m) => (m.id === matchId ? updated : m));
    const players = applyPlayerStats(s.players, match.leagueId, matches, s.races).map((p) =>
      p.leagueId === match.leagueId ? { ...p, updatedAt: nowIso() } : p,
    );
    return { ...s, matches, players };
  });
  const store = getStore();
  await scheduleSync([
    {
      entity: 'match',
      docId: updated.id,
      leagueId: updated.leagueId,
      action: 'upsert',
      payload: updated,
      updatedAt: updated.updatedAt,
    },
    ...store.players
      .filter((p) => p.leagueId === match.leagueId)
      .map((player) => ({
        entity: 'player' as const,
        docId: player.id,
        leagueId: player.leagueId,
        action: 'upsert' as const,
        payload: player,
        updatedAt: player.updatedAt,
      })),
  ]);
  logger.info('match.service', 'Frame duration cleared', { matchId, frameIndex });
  return updated;
}

export async function addFrame(
  matchId: string,
  frame: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b' },
): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (match.outcome.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }

  const durationSeconds = durationFromTimer(match);
  const scored: FrameScore = {
    ...frame,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
  const frames = [...match.frames, scored];
  const outcome = maybeComplete(match, frames);
  const stillInProgress = outcome.status === 'in_progress';
  const timer = nextFrameTimer(match, stillInProgress);
  const updated: Match = {
    ...match,
    frames,
    outcome,
    ...timer,
    updatedAt: nowIso(),
  };

  let event: FeedEvent | undefined;
  if (outcome.status === 'completed') {
    event = {
      id: createId('ev'),
      leagueId: match.leagueId,
      type: match.crownsChampion ? 'team_crowned' : 'match_won',
      createdAt: updated.updatedAt,
      updatedAt: updated.updatedAt,
      title: match.crownsChampion ? 'New reigning champions' : 'Match complete',
      body: match.namedLabel ?? `Best of ${match.bestOf}`,
      relatedIds: [...match.teamA, ...match.teamB, match.id],
    };
  }

  await persistMatchResult(updated, event);
  logger.info('match.service', 'Frame added', { matchId, status: outcome.status });
  return updated;
}

/**
 * Award the current frame to the opponent via forfeit.
 * The match only ends (status `forfeited`) when after that frame the
 * forfeiting side can no longer reach the frames needed to win.
 */
export async function forfeitFrame(
  matchId: string,
  forfeitedBy: 'a' | 'b',
  framePoints?: { teamAPoints: number; teamBPoints: number },
): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (match.outcome.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }

  const prior = tallyFromFrames(match.frames);
  const framePointsA = Math.max(0, Math.floor(framePoints?.teamAPoints ?? 0));
  const framePointsB = Math.max(0, Math.floor(framePoints?.teamBPoints ?? 0));
  const frameWinner: 'a' | 'b' = forfeitedBy === 'a' ? 'b' : 'a';
  const durationSeconds = durationFromTimer(match);

  const frames: FrameScore[] = [
    ...match.frames,
    {
      teamAPoints: framePointsA,
      teamBPoints: framePointsB,
      winner: frameWinner,
      viaForfeit: true,
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    },
  ];
  const tally = tallyFromFrames(frames);
  const forfeitSideCanCatchUp = sideCanStillWin(
    match.bestOf,
    tally.framesA,
    tally.framesB,
    forfeitedBy,
  );

  const updatedAt = nowIso();
  let outcome: MatchOutcome;
  let event: FeedEvent | undefined;

  if (!forfeitSideCanCatchUp) {
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
      framePointsA > 0 || framePointsB > 0 ? ` · frame ${framePointsA}–${framePointsB}` : '';
    event = {
      id: createId('ev'),
      leagueId: match.leagueId,
      type: match.crownsChampion ? 'team_crowned' : 'match_won',
      createdAt: updatedAt,
      updatedAt,
      title: match.crownsChampion ? 'Champions by forfeit' : 'Win by forfeit',
      body: `Frame forfeit locked the match ${tally.framesA}–${tally.framesB}${pointsPart} · Team ${forfeitedBy.toUpperCase()} walked`,
      relatedIds: [...match.teamA, ...match.teamB, match.id],
    };
  } else {
    outcome = { status: 'in_progress', ...tally };
  }

  const timer = nextFrameTimer(match, outcome.status === 'in_progress');
  const updated: Match = {
    ...match,
    frames,
    outcome,
    ...timer,
    updatedAt,
  };

  await persistMatchResult(updated, event);
  logger.info('match.service', 'Frame forfeited', {
    matchId,
    forfeitedBy,
    matchOver: outcome.status === 'forfeited',
  });
  return updated;
}

/** Edit an existing frame (points / winner). Reopens the match if the clinch is undone. */
export async function updateFrame(
  matchId: string,
  frameIndex: number,
  patch: {
    teamAPoints: number;
    teamBPoints: number;
    winner: 'a' | 'b';
    viaForfeit?: boolean;
  },
): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (frameIndex < 0 || frameIndex >= match.frames.length) {
    throw new AppError('VALIDATION', 'Frame not found');
  }

  const prev = match.frames[frameIndex]!;
  const frames = match.frames.map((f, i) => {
    if (i !== frameIndex) {
      return f;
    }
    return {
      ...f,
      teamAPoints: Math.max(0, Math.floor(patch.teamAPoints)),
      teamBPoints: Math.max(0, Math.floor(patch.teamBPoints)),
      winner: patch.winner,
      viaForfeit: patch.viaForfeit ?? prev.viaForfeit,
    };
  });

  const updated = await applyFrameListChange(match, frames);
  logger.info('match.service', 'Frame updated', { matchId, frameIndex });
  return updated;
}

/** Delete a frame. Reopens the match if the clinch is undone. */
export async function deleteFrame(matchId: string, frameIndex: number): Promise<Match> {
  await loadStore();
  const match = getStore().matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  if (frameIndex < 0 || frameIndex >= match.frames.length) {
    throw new AppError('VALIDATION', 'Frame not found');
  }

  const frames = match.frames.filter((_, i) => i !== frameIndex);
  const updated = await applyFrameListChange(match, frames);
  logger.info('match.service', 'Frame deleted', { matchId, frameIndex });
  return updated;
}

export function playerNamesForMatch(
  match: Match,
  nameOf: (id: string) => string,
): { teamA: string; teamB: string } {
  const sideLabel = (ids: string[]): string => {
    if (ids.length === 0) {
      return '—';
    }
    if (ids.length === 1) {
      return nameOf(ids[0]!);
    }
    return `${nameOf(ids[0]!)} & ${nameOf(ids[1]!)}`;
  };
  return {
    teamA: sideLabel(match.teamA),
    teamB: sideLabel(match.teamB),
  };
}

export function describeForfeit(match: Match, nameOf: (id: string) => string): string | null {
  if (match.outcome.status !== 'forfeited') {
    return null;
  }
  const labels = playerNamesForMatch(match, nameOf);
  const quitters = match.outcome.forfeitedBy === 'a' ? labels.teamA : labels.teamB;
  const winners = match.outcome.winner === 'a' ? labels.teamA : labels.teamB;
  const frames = `${match.outcome.scoreAtForfeit.framesA}–${match.outcome.scoreAtForfeit.framesB}`;
  const ptsA = match.outcome.scoreAtForfeit.framePointsA ?? 0;
  const ptsB = match.outcome.scoreAtForfeit.framePointsB ?? 0;
  const pointsPart = ptsA > 0 || ptsB > 0 ? ` (frame points ${ptsA}–${ptsB})` : '';
  return `${quitters} forfeited a frame at ${frames}${pointsPart} · ${winners} win the match`;
}

export function describeChampions(league: League, nameOf: (id: string) => string): string | null {
  if (!league.reigningTeam || league.reigningTeam.playerIds.length === 0) {
    return null;
  }
  return league.reigningTeam.playerIds.map((id) => nameOf(id)).join(' & ');
}
