import Constants from 'expo-constants';

function env(key: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return (process.env[key] ?? extra?.[key] ?? '').trim();
}

/** Base URL of the Snookit API, without a trailing slash ('' when not configured). */
export function getApiBaseUrl(): string {
  return env('EXPO_PUBLIC_API_URL').replace(/\/+$/, '');
}

/**
 * True when the app talks to the Snookit API. False keeps every user local-only, either on
 * purpose (EXPO_PUBLIC_USE_LOCAL_DATA=true) or because no API address is configured.
 */
export function isCloudEnabled(): boolean {
  return env('EXPO_PUBLIC_USE_LOCAL_DATA') !== 'true' && getApiBaseUrl().length > 0;
}

/** Sentry project DSN for crash and error reports ('' turns reporting off). */
export function getSentryDsn(): string {
  return env('EXPO_PUBLIC_SENTRY_DSN');
}

export function getGoogleWebClientId(): string {
  return env('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');
}

/** Stable public web address of the app (EAS Hosting). Used for shareable https links. */
const DEFAULT_PUBLIC_WEB_ORIGIN = 'https://snookit.expo.app';

export function getPublicWebOrigin(): string {
  const configured = env('EXPO_PUBLIC_WEB_ORIGIN').replace(/\/+$/, '');
  return configured.length > 0 ? configured : DEFAULT_PUBLIC_WEB_ORIGIN;
}
