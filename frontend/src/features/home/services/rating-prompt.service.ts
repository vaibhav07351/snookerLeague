import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

import { highestBreakFromShots } from '@/features/match/services/frame-engine';
import { logger } from '@/shared/logging/logger';
import { readPreference, writePreference } from '@/shared/storage/preferences';
import type { Match } from '@/shared/types/domain';

const LAST_PROMPT_KEY = 'lastReviewPromptAt';
const MIN_DAYS_BETWEEN = 90;

/** True when this player won the match or made a century in it: a happy moment to ask. */
export function isProudMoment(match: Match, myPlayerId: string | null): boolean {
  if (!myPlayerId || match.outcome.status === 'in_progress') {
    return false;
  }
  const mySide = match.teamA.includes(myPlayerId)
    ? 'a'
    : match.teamB.includes(myPlayerId)
      ? 'b'
      : null;
  if (!mySide) {
    return false;
  }
  if (match.outcome.winner === mySide) {
    return true;
  }
  return match.frames.some((f) => highestBreakFromShots(f.shots ?? [], mySide) >= 100);
}

/**
 * Ask for a Play Store rating after a win or a century, at most once every 90 days. The store
 * itself may still decide not to show it; that is fine.
 */
export async function maybeAskForRating(match: Match, myPlayerId: string | null): Promise<void> {
  if (Platform.OS === 'web' || !isProudMoment(match, myPlayerId)) {
    return;
  }
  const last = Number(await readPreference(LAST_PROMPT_KEY));
  if (Number.isFinite(last) && Date.now() - last < MIN_DAYS_BETWEEN * 24 * 60 * 60 * 1000) {
    return;
  }
  try {
    if (!(await StoreReview.hasAction())) {
      return;
    }
    await writePreference(LAST_PROMPT_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch (error) {
    logger.warn('rating-prompt', 'Review prompt failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}
