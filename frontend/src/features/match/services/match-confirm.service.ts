import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import type { Match, Player } from '@/shared/types/domain';

/**
 * Result confirmation for the public rating (phase 6). A finished match counts for the
 * public rating only when each side agreed to it: the scorer/creator implicitly, everyone
 * else by confirming here. Changing the result later clears all confirmations (the server
 * does this, so an edited result has to be confirmed again).
 */

function finished(match: Match): boolean {
  return match.outcome.status === 'completed' || match.outcome.status === 'forfeited';
}

/** True when this account played in the match and has not agreed to its result yet. */
export function canConfirm(
  match: Match,
  uid: string | null | undefined,
  players: Player[],
): boolean {
  if (!uid || !finished(match) || match.tournamentId) {
    return false;
  }
  if (match.createdByUid === uid || match.scorerUid === uid) {
    return false;
  }
  if ((match.confirmedByUids ?? []).includes(uid)) {
    return false;
  }
  const mine = new Set(players.filter((p) => p.authUid === uid).map((p) => p.id));
  return [...match.teamA, ...match.teamB].some((id) => mine.has(id));
}

export function isConfirmedBy(match: Match, uid: string | null | undefined): boolean {
  return uid != null && (match.confirmedByUids ?? []).includes(uid);
}

export async function confirmResult(matchId: string): Promise<void> {
  await loadStore();
  const store = getStore();
  const user = store.user;
  const match = store.matches.find((m) => m.id === matchId);
  if (!user || !match) {
    throw new AppError('NOT_FOUND', 'Match not found');
  }
  const players = store.players.filter((p) => p.leagueId === match.leagueId);
  if (!canConfirm(match, user.uid, players)) {
    throw new AppError('INVALID_STATE', 'Only an opponent can confirm this result');
  }
  const next: Match = { ...match, confirmedByUids: [...(match.confirmedByUids ?? []), user.uid] };
  await updateStore((s) => ({
    ...s,
    matches: s.matches.map((m) => (m.id === matchId ? next : m)),
  }));
  // Only the confirmation is sent: the server accepts it from a player who is not scoring.
  await scheduleSync([
    {
      entity: 'match',
      docId: next.id,
      leagueId: next.leagueId,
      action: 'upsert',
      payload: next,
      updatedAt: next.updatedAt,
      fieldsOnly: ['confirmedByUids'],
    },
  ]);
  logger.info('match-confirm', 'Result confirmed', { matchId });
}
