import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/shared/logging/logger';
import { readPreference, writePreference } from '@/shared/storage/preferences';
import { getStore, loadStore } from '@/shared/storage/local-store';
import { scheduleSync, shouldCloudSync } from '@/shared/sync';
import { nowIso } from '@/shared/utils/id';

/**
 * Push notifications (phase 6): this phone registers its Expo push token with the server,
 * which sends a notice when someone challenges you, accepts your challenge or follows you.
 * Notification taps open the screen named in the notification's `url`.
 *
 * Permission is never asked at start-up. The app offers it at a moment where it obviously
 * helps (after sending a challenge or following someone, see `use-push-offer`), first with
 * its own sheet, and only asks the phone after a yes: Android and iOS show their own prompt
 * only a limited number of times.
 */

/** When the in-app offer was last shown (ISO time), so a "Not now" is respected for a while. */
const OFFERED_AT_KEY = 'pushOfferedAt';
const OFFER_AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

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

async function cloudUserUid(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  await loadStore();
  const user = getStore().user;
  return user && shouldCloudSync(user) ? user.uid : null;
}

/**
 * Register this phone's push token for the signed-in account if notifications are already
 * allowed. Never shows a permission prompt, so it is safe on every start; it runs once per
 * account per launch.
 */
export async function registerForPush(): Promise<void> {
  const uid = await cloudUserUid();
  if (!uid || registeredFor === uid) {
    return;
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) {
      return;
    }
    await registerToken(uid);
  } catch (error) {
    // Emulators and builds without push credentials end up here; the app works without push.
    logger.warn('push.service', 'Push registration failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** What to do at a moment where notifications would help. */
export type PushOffer = 'offer' | 'skip';

/**
 * 'offer' when the in-app offer should be shown now: signed in on a phone, not allowed yet,
 * the phone can still ask, and no offer in the last 30 days. Already allowed registers the
 * token instead (for example after the person allowed it in the phone's settings).
 */
export async function pushOfferState(now: Date = new Date()): Promise<PushOffer> {
  if (!(await cloudUserUid())) {
    return 'skip';
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      await registerForPush();
      return 'skip';
    }
    if (!current.canAskAgain) {
      return 'skip';
    }
  } catch (error) {
    logger.warn('push.service', 'Permission check failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    return 'skip';
  }
  const offeredAt = Date.parse((await readPreference(OFFERED_AT_KEY)) ?? '');
  if (Number.isFinite(offeredAt) && now.getTime() - offeredAt < OFFER_AGAIN_AFTER_MS) {
    return 'skip';
  }
  return 'offer';
}

/** Remember that the offer was shown, whatever the answer. */
export async function notePushOffered(now: Date = new Date()): Promise<void> {
  await writePreference(OFFERED_AT_KEY, now.toISOString());
}

/** After a yes in the app's own sheet: ask the phone, then register. True when allowed. */
export async function enablePush(): Promise<boolean> {
  const uid = await cloudUserUid();
  if (!uid) {
    return false;
  }
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) {
      logger.info('push.service', 'Notifications not allowed');
      return false;
    }
    await registerToken(uid);
    return true;
  } catch (error) {
    logger.warn('push.service', 'Push registration failed', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}

/** Get this phone's Expo push token and save it for the account (throws on failure). */
async function registerToken(uid: string): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Snookit',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  registeredFor = uid;
  const id = tokenId(uid, token);
  await scheduleSync([
    {
      entity: 'device',
      docId: id,
      leagueId: null,
      action: 'upsert',
      payload: { id, uid, pushToken: token, platform: Platform.OS, updatedAt: nowIso() },
    },
  ]);
}

/** The in-app path a tapped notification should open, if it names one. */
export function notificationUrl(response: Notifications.NotificationResponse): string | null {
  const url = (response.notification.request.content.data as { url?: unknown } | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
