import type { League, Match } from '@/shared/types/domain';

/**
 * Scoring is "one scorer at a time": only `scorerUid` records shots, so two phones can never
 * overwrite each other's shots. Others watch live and can take over when the policy allows.
 * Firestore rules enforce the same contract server-side (see firestore.rules, matches).
 */
export function currentScorerUid(match: Match): string {
  return match.scorerUid ?? match.createdByUid;
}

export function isMatchScorer(match: Match, uid: string | null | undefined): boolean {
  return uid != null && currentScorerUid(match) === uid;
}

/** Match creator or league owner: may delete the match, change policy, make it a title match. */
export function canManageMatch(
  match: Match,
  league: Pick<League, 'createdByUid'> | null,
  uid: string | null | undefined,
): boolean {
  if (!uid) {
    return false;
  }
  return match.createdByUid === uid || league?.createdByUid === uid;
}

export function canTakeOverScoring(
  match: Match,
  league: Pick<League, 'createdByUid' | 'memberUids'> | null,
  uid: string | null | undefined,
): boolean {
  if (!uid || match.outcome.status !== 'in_progress' || isMatchScorer(match, uid)) {
    return false;
  }
  if (canManageMatch(match, league, uid)) {
    return true;
  }
  const isMember = league?.memberUids.includes(uid) ?? false;
  if (!isMember) {
    return false;
  }
  if ((match.scoringPolicy ?? 'anyone') === 'anyone') {
    return true;
  }
  return (match.allowedScorerUids ?? []).includes(uid);
}
