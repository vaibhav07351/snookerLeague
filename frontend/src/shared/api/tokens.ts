import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { logger } from '@/shared/logging/logger';

/** The signed-in session's tokens. The access token is short-lived; refresh renews it. */
export interface SessionTokens {
  uid: string;
  accessToken: string;
  /** ISO time the access token stops working. */
  accessExpiresAt: string;
  refreshToken: string;
}

const KEY = 'snookit.session';

let cached: SessionTokens | null = null;
let loading: Promise<SessionTokens | null> | null = null;

/**
 * Phones keep tokens in the OS keychain/keystore. The web has no such store, so the browser's
 * local storage is used there (any script on the page could read it; the refresh token is
 * single-use and rotated, which limits what a stolen copy is worth).
 */
async function readRaw(): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(KEY) : SecureStore.getItemAsync(KEY);
}

async function writeRaw(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    await (value == null ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, value));
    return;
  }
  await (value == null ? SecureStore.deleteItemAsync(KEY) : SecureStore.setItemAsync(KEY, value));
}

function isTokens(value: unknown): value is SessionTokens {
  const v = value as Partial<SessionTokens> | null;
  return (
    typeof v?.uid === 'string' &&
    typeof v.accessToken === 'string' &&
    typeof v.accessExpiresAt === 'string' &&
    typeof v.refreshToken === 'string'
  );
}

/** Load the saved session once; later calls share the first read. */
export function loadTokens(): Promise<SessionTokens | null> {
  loading ??= (async () => {
    try {
      const raw = await readRaw();
      const parsed: unknown = raw == null ? null : JSON.parse(raw);
      cached = isTokens(parsed) ? parsed : null;
    } catch (error) {
      logger.error('api.tokens', 'Could not read the saved session', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
      cached = null;
    }
    return cached;
  })();
  return loading;
}

/** The session in memory (call loadTokens once at start-up first). */
export function getTokens(): SessionTokens | null {
  return cached;
}

/** True when this phone holds a session for `uid`. */
export function hasSessionFor(uid: string): boolean {
  return cached?.uid === uid;
}

export async function saveTokens(tokens: SessionTokens): Promise<void> {
  cached = tokens;
  loading = Promise.resolve(tokens);
  await writeRaw(JSON.stringify(tokens));
}

export async function clearTokens(): Promise<void> {
  cached = null;
  loading = Promise.resolve(null);
  await writeRaw(null);
}
