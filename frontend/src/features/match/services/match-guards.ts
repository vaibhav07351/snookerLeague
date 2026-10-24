import { canManageMatch, isMatchScorer } from '@/features/match/services/match-access';
import { AppError } from '@/shared/errors/app-error';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { League, Match } from '@/shared/types/domain';

export interface MatchContext {
  match: Match;
  league: League | null;
  uid: string | null;
}

export async function loadMatchContext(matchId: string): Promise<MatchContext> {
  await loadStore();
  const store = getStore();
  const match = store.matches.find((m) => m.id === matchId);
  if (!match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  return {
    match,
    league: store.leagues.find((l) => l.id === match.leagueId) ?? null,
    uid: store.user?.uid ?? null,
  };
}

export function requireInProgress(match: Match): void {
  if (match.outcome.status !== 'in_progress') {
    throw new AppError('INVALID_STATE', 'Match already finished');
  }
}

/** Only the current scorer records shots and frames. */
export function requireScorer(ctx: MatchContext): void {
  if (!isMatchScorer(ctx.match, ctx.uid)) {
    throw new AppError(
      'NOT_SCORER',
      'Someone else is scoring this match. Tap "Take over scoring" to score from this phone.',
    );
  }
}

/** Fixing frames after the fact: the scorer, the match creator or the league owner. */
export function requireEditor(ctx: MatchContext): void {
  if (!isMatchScorer(ctx.match, ctx.uid) && !canManageMatch(ctx.match, ctx.league, ctx.uid)) {
    throw new AppError('FORBIDDEN', 'Only the scorer or the match creator can change frames');
  }
}

export function requireManager(ctx: MatchContext): void {
  if (!canManageMatch(ctx.match, ctx.league, ctx.uid)) {
    throw new AppError('FORBIDDEN', 'Only the match creator or league owner can do this');
  }
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Run match writes one at a time, in call order. Each write reads the latest match from the
 * store, so without this two quick taps could both read the same state and one shot would
 * be lost. A failed write does not block the ones queued after it.
 */
export function serializeMatchWrite<T>(matchId: string, write: () => Promise<T>): Promise<T> {
  const previous = queues.get(matchId) ?? Promise.resolve();
  const next = previous.then(write, write);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  queues.set(matchId, settled);
  void settled.then(() => {
    if (queues.get(matchId) === settled) {
      queues.delete(matchId);
    }
  });
  return next;
}
