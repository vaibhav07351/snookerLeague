import * as Linking from 'expo-linking';
import { Linking as RnLinking, Share } from 'react-native';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.snooker.league';

export function profileDeepLink(uid: string): string {
  return Linking.createURL('city-player', { queryParams: { uid } });
}

export async function shareProfile(uid: string, displayName: string): Promise<void> {
  const url = profileDeepLink(uid);
  try {
    await Share.share({
      message: `Follow ${displayName} on Snookit\n${url}`,
      url,
    });
  } catch (error) {
    logger.error('share.service', 'Share failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    throw new AppError('SHARE_FAILED', 'Could not open the share sheet');
  }
}

export async function openPlayStoreListing(): Promise<void> {
  const supported = await RnLinking.canOpenURL(PLAY_STORE_URL);
  if (!supported) {
    throw new AppError('LINK_FAILED', 'Could not open the Play Store listing');
  }
  await RnLinking.openURL(PLAY_STORE_URL);
}
