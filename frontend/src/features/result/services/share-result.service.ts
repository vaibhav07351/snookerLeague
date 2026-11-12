import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { ResultKind } from '@/features/result/types/result.types';
import { getApiBaseUrl } from '@/shared/config/env';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';

const DEFAULT_PUBLIC_BASE = 'https://snookit.duckdns.org';

/** Path word of each kind's public page: /m/<id>, /r/<id>, /g/<id>. */
const PATH: Record<ResultKind, string> = { match: 'm', race: 'r', group: 'g' };

/** The public page for a result (shows a rich preview card in WhatsApp, opens in the app). */
export function resultShareUrl(kind: ResultKind, id: string): string {
  return `${getApiBaseUrl() || DEFAULT_PUBLIC_BASE}/${PATH[kind]}/${encodeURIComponent(id)}`;
}

/** Share the result link as text (works everywhere, including the web build). */
export async function shareResultLink(
  kind: ResultKind,
  id: string,
  summary: string,
): Promise<void> {
  const url = resultShareUrl(kind, id);
  try {
    await Share.share({ message: `${summary}\n${url}`, url });
  } catch (error) {
    logger.error('share-result', 'Link share failed', {
      kind,
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not open the share sheet');
  }
}

/**
 * Share a picture of the result card (phones only). Falls back to the link where images
 * can't be shared (the web build, or no share target on the device).
 */
export async function shareResultCard(
  card: RefObject<View | null>,
  kind: ResultKind,
  id: string,
  summary: string,
): Promise<void> {
  if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
    await shareResultLink(kind, id, summary);
    return;
  }
  try {
    const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: summary });
  } catch (error) {
    logger.error('share-result', 'Card share failed', {
      kind,
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not share the result card');
  }
}
