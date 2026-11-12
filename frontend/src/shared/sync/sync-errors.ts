import { ApiError, NetworkError, apiErrorMeta } from '@/shared/api/client';

/** A write the server refused, as returned per operation by /v1/sync/push. */
export class RejectedWriteError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RejectedWriteError';
    this.code = code;
  }
}

/**
 * Errors that retrying can never fix (the server said no, or the data is malformed). Such
 * writes are dropped instead of blocking every write queued behind them. 401 is not one of
 * them: the change stays queued until the user signs in again.
 */
export function isPermanentWriteError(error: unknown): boolean {
  if (error instanceof RejectedWriteError) {
    return true;
  }
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

/** No answer from the server (offline, timeout), as opposed to an answer that said no. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof NetworkError;
}

/** 401 sign in again, 408 timeout, 429 slow down, 502-504 the server is restarting or down. */
const TRANSIENT_STATUSES = new Set([401, 408, 429, 502, 503, 504]);

/**
 * Failures that say nothing about the write itself: no network, the session needs a new
 * sign-in, the server asked us to slow down or is briefly unavailable. Wait and try again,
 * never give up on the write.
 */
export function isTransientError(error: unknown): boolean {
  if (isNetworkError(error)) {
    return true;
  }
  return error instanceof ApiError && TRANSIENT_STATUSES.has(error.status);
}

/** Error fields that are safe to put in logs. */
export function syncErrorMeta(error: unknown): { shape: string; status?: number; code?: string } {
  if (error instanceof RejectedWriteError) {
    return { shape: error.name, code: error.code };
  }
  return apiErrorMeta(error);
}
