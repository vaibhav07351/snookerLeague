import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { highestBreakFromShots } from '@/features/match/services/frame-engine';
import { getApiBaseUrl } from '@/shared/config/env';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import type { Match } from '@/shared/types/domain';

const DEFAULT_PUBLIC_BASE = 'https://snookit.duckdns.org';

/** The public page for a match (shows a rich preview card in WhatsApp). */
export function matchShareUrl(matchId: string): string {
  return `${getApiBaseUrl() || DEFAULT_PUBLIC_BASE}/m/${encodeURIComponent(matchId)}`;
}

/** Highest break anyone made in the match (for "50+ break" share cards). */
export function matchHighestBreak(match: Match): number {
  return match.frames.reduce((max, f) => Math.max(max, highestBreakFromShots(f.shots ?? [])), 0);
}

/** Share the match link as text (works everywhere, including the web build). */
export async function shareMatchLink(match: Match, summary: string): Promise<void> {
  const url = matchShareUrl(match.id);
  try {
    await Share.share({ message: `${summary}\n${url}`, url });
  } catch (error) {
    logger.error('share-match', 'Link share failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not open the share sheet');
  }
}

/**
 * Share a picture of the result card (phones only). Falls back to the link where images
 * can't be shared (the web build, or no share target on the device).
 */
export async function shareMatchCard(
  card: RefObject<View | null>,
  match: Match,
  summary: string,
): Promise<void> {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
    await shareMatchLink(match, summary);
    return;
  }
  try {
    const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: summary });
  } catch (error) {
    logger.error('share-match', 'Card share failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not share the result card');
  }
}
