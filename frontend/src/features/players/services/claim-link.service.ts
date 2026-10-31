import { Share } from 'react-native';

import { ApiError, apiErrorMeta, apiRequest } from '@/shared/api/client';
import type { ServerDoc } from '@/shared/api/sync-api';
import { getApiBaseUrl } from '@/shared/config/env';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { onActiveLeagueChanged, shouldCloudSync } from '@/shared/sync';
import { replaceWithServerDoc } from '@/shared/sync/apply';
import { pullLeague } from '@/shared/sync/pull';

/**
 * Claim links (phase 4): send a guest a link; when they open it and sign in, they take over
 * their guest card (with its match history) and join the league. Single use, 7 days.
 */

function claimUrl(token: string): string {
  return `${getApiBaseUrl() || 'https://snookit.duckdns.org'}/claim/${encodeURIComponent(token)}`;
}

export async function shareClaimLink(playerId: string, playerName: string): Promise<void> {
  await loadStore();
  if (!shouldCloudSync(getStore().user)) {
    throw new AppError('NEEDS_ACCOUNT', 'Sign in with Google to send claim links.');
  }
  let token: string;
  try {
    ({ token } = await apiRequest<{ token: string }>('/v1/claims', {
      method: 'POST',
      body: { playerId },
    }));
  } catch (error) {
    logger.error('claim-link', 'Could not create a claim link', apiErrorMeta(error));
    if (error instanceof ApiError && error.code === 'card_taken') {
      throw new AppError('CARD_TAKEN', 'This player already belongs to someone.');
    }
    throw new AppError('NETWORK', 'Could not create the link. Check your connection.');
  }
  const url = claimUrl(token);
  await Share.share({
    message: `${playerName}, this is your Snookit player card with all your matches. Open the link and sign in to claim it (works once, for 7 days):\n${url}`,
    url,
  });
}

/** Take over the card behind a claim link, join its league and make it the active one. */
export async function redeemClaimLink(token: string): Promise<string> {
  await loadStore();
  if (!shouldCloudSync(getStore().user)) {
    throw new AppError('NEEDS_ACCOUNT', 'Sign in with Google first, then open the link again.');
  }
  let res: { league: ServerDoc; player: ServerDoc };
  try {
    res = await apiRequest('/v1/claims/redeem', { method: 'POST', body: { token } });
  } catch (error) {
    logger.error('claim-link', 'Could not redeem a claim link', apiErrorMeta(error));
    if (
      error instanceof ApiError &&
      (error.code === 'claim_invalid' || error.code === 'card_taken')
    ) {
      throw new AppError('CLAIM_INVALID', error.message);
    }
    throw new AppError('NETWORK', 'Could not claim right now. Check your connection.');
  }
  await replaceWithServerDoc(res.league);
  await replaceWithServerDoc(res.player);
  try {
    await pullLeague(res.league.id);
  } catch (error) {
    logger.warn('claim-link', 'League history did not load yet', apiErrorMeta(error));
  }
  await updateStore((s) => ({ ...s, activeLeagueId: res.league.id }));
  await onActiveLeagueChanged(res.league.id);
  return res.league.id;
}
