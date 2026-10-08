import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/shared/logging/logger';

/**
 * Small per-device preferences (theme, dismissed tips). Kept apart from the synced
 * app store: these never leave the device and never block on cloud sync.
 */
const PREFIX = 'snookit.pref.';

/** Invite opened before sign-in; belongs to whoever is signing in, so cleared on sign-out. */
export const PENDING_INVITE_KEY = 'pendingInvite';

/** Preferences tied to the signed-in person (theme and tips stay with the device). */
const SESSION_KEYS = [PENDING_INVITE_KEY] as const;

export async function clearSessionPreferences(): Promise<void> {
  await Promise.all(SESSION_KEYS.map((key) => writePreference(key, null)));
}

export async function readPreference(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFIX + key);
  } catch (error) {
    logger.warn('preferences', 'Read failed', { key, error: String(error) });
    return null;
  }
}

export async function writePreference(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) {
      await AsyncStorage.removeItem(PREFIX + key);
    } else {
      await AsyncStorage.setItem(PREFIX + key, value);
    }
  } catch (error) {
    logger.warn('preferences', 'Write failed', { key, error: String(error) });
  }
}
