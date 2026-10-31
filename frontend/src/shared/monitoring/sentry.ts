import * as Sentry from '@sentry/react-native';

import { getSentryDsn } from '@/shared/config/env';
import { setErrorReporter } from '@/shared/logging/logger';

let started = false;

/**
 * Start crash and error reporting when EXPO_PUBLIC_SENTRY_DSN is set; otherwise do nothing.
 * Every logger.error is sent too, with its fields (ids and shapes only, never personal data).
 */
export function initMonitoring(): void {
  const dsn = getSentryDsn();
  if (started || !dsn) {
    return;
  }
  started = true;
  Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0 });
  setErrorReporter((layer, message, extra) => {
    Sentry.captureMessage(`${layer}: ${message}`, { level: 'error', extra });
  });
}
