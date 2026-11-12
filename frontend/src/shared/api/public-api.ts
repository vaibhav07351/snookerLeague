import { ApiError, apiRequest } from '@/shared/api/client';

/** Kinds the public result endpoint serves. */
export type PublicResultKind = 'match' | 'race' | 'group';

/** A shorter wait than signed-in calls: someone is looking at a spinner. */
const PUBLIC_TIMEOUT_MS = 10_000;

/**
 * A game's public result (short names, under-18 players hidden), readable without signing
 * in. Resolves null when the game does not exist or was deleted. The body is unvalidated:
 * the caller checks its shape.
 */
export async function getPublicResult(kind: PublicResultKind, id: string): Promise<unknown> {
  try {
    return await apiRequest<unknown>(`/v1/public/results/${kind}/${encodeURIComponent(id)}`, {
      auth: false,
      timeoutMs: PUBLIC_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
