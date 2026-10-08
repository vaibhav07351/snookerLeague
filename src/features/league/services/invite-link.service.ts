import { Platform, Share } from 'react-native';

import { AppError } from '@/shared/errors/app-error';
import { getPublicWebOrigin } from '@/shared/firebase/config';
import { logger } from '@/shared/logging/logger';
import { PENDING_INVITE_KEY, readPreference, writePreference } from '@/shared/storage/preferences';
import type { League } from '@/shared/types/domain';

function linkOrigin(): string {
  // On web, links point at the site you are on (localhost in dev, the deployed origin in prod).
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return getPublicWebOrigin();
}

/**
 * Shareable https invite link. https (not the app's custom scheme) so it is tappable in
 * WhatsApp, SMS and email; it opens the join screen of the web app or, once Android App
 * Links are set up, the installed app.
 */
export function inviteUrl(code: string): string {
  return `${linkOrigin()}/join/${encodeURIComponent(code.toUpperCase())}`;
}

export function inviteMessage(league: Pick<League, 'name' | 'inviteCode'>): string {
  return [
    `Join "${league.name}" on Snookit so we can score our snooker matches together.`,
    inviteUrl(league.inviteCode),
    `Or open Snookit, tap "Join a league" and enter code ${league.inviteCode}.`,
  ].join('\n');
}

export type ShareResult = 'shared' | 'copied' | 'dismissed';

/** Open the share sheet; on web browsers without one, copy the invite to the clipboard. */
export async function shareLeagueInvite(
  league: Pick<League, 'name' | 'inviteCode'>,
): Promise<ShareResult> {
  const message = inviteMessage(league);
  const url = inviteUrl(league.inviteCode);

  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Join ${league.name}`, text: message });
        return 'shared';
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        return 'copied';
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'dismissed';
      }
      logger.warn('invite-link', 'Web share failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
    throw new AppError('SHARE_FAILED', `Could not share. Send this link instead: ${url}`);
  }

  try {
    const result = await Share.share({ message, url, title: `Join ${league.name}` });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch (error) {
    logger.error('invite-link', 'Share failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not open the share sheet');
  }
}

/** Remember an invite opened while signed out, to continue after sign-in and setup. */
export async function savePendingInvite(code: string): Promise<void> {
  await writePreference(PENDING_INVITE_KEY, code.toUpperCase());
}

export async function readPendingInvite(): Promise<string | null> {
  return readPreference(PENDING_INVITE_KEY);
}

export async function clearPendingInvite(): Promise<void> {
  await writePreference(PENDING_INVITE_KEY, null);
}
