import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/shared/logging/logger';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { scheduleSync, shouldCloudSync } from '@/shared/sync';
import { nowIso } from '@/shared/utils/id';

/**
 * Push notifications (phase 6): this phone registers its Expo push token with the server,
 * which sends a notice when someone challenges you, accepts your challenge or follows you.
 * Notification taps open the screen named in the notification's `url`.
 */

let registeredFor: string | null = null;

/** Show notifications that arrive while the app is open, too. */
export function configureNotifications(): void {
  if (Platform.OS === 'web') {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** A short, stable id for a token (row ids allow only letters, digits, _ and -). */
function tokenId(uid: string, token: string): string {
  let h = 0;
  for (let i = 0; i < token.length; i += 1) {
    h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  }
  return `dv_${uid}_${(h >>> 0).toString(36)}`;
}

/**
 * Ask for permission (once; the OS remembers the answer) and register this phone's push token
 * for the signed-in account. Safe to call on every start: it runs once per account per launch.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await loadStore();
  const user = getStore().user;
  if (!user || !shouldCloudSync(user) || registeredFor === user.uid) {
    return;
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Snookit',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      logger.info('push.service', 'Notifications not allowed');
      return;
    }
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    registeredFor = user.uid;
    const id = tokenId(user.uid, token);
    await scheduleSync([
      {
        entity: 'device',
        docId: id,
        leagueId: null,
        action: 'upsert',
        payload: {
          id,
          uid: user.uid,
          pushToken: token,
          platform: Platform.OS,
          updatedAt: nowIso(),
        },
      },
    ]);
  } catch (error) {
    // Emulators and builds without push credentials end up here; the app works without push.
    logger.warn('push.service', 'Push registration failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** The in-app path a tapped notification should open, if it names one. */
export function notificationUrl(response: Notifications.NotificationResponse): string | null {
  const url = (response.notification.request.content.data as { url?: unknown } | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
