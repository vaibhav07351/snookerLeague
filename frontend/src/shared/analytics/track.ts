import { apiErrorMeta } from '@/shared/api/client';
import { postEvent, type ClientEvent } from '@/shared/api/events-api';
import { logger } from '@/shared/logging/logger';
import { getStore } from '@/shared/storage/local-store';
import { shouldCloudSync } from '@/shared/sync/cloud-session';

/**
 * Report a product event, best effort: it never waits, never throws, and is skipped for demo
 * and local-only users. An event lost offline is not retried; these are counts, not data.
 */
export function trackEvent(event: ClientEvent): void {
  if (!shouldCloudSync(getStore().user)) {
    return;
  }
  postEvent(event).catch((error: unknown) => {
    logger.warn('analytics', 'Event not sent', { event: event.name, ...apiErrorMeta(error) });
  });
}
