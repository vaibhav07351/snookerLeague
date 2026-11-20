import { apiRequest } from '@/shared/api/client';

/** Events the app reports itself (the server records scores and claim links on its own). */
export type ClientEventName = 'share_tapped';

export interface ClientEvent {
  name: ClientEventName;
  /** The id the event is about, for example the shared game. */
  ref?: string;
  props: Record<string, string>;
}

/** A counter, not something anyone waits for: give up quickly. */
const EVENT_TIMEOUT_MS = 5_000;

/** Report one product event for the signed-in user. */
export async function postEvent(event: ClientEvent): Promise<void> {
  await apiRequest<void>('/v1/events', {
    method: 'POST',
    body: event,
    timeoutMs: EVENT_TIMEOUT_MS,
  });
}
