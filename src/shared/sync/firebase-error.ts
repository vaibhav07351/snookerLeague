import { FirebaseError } from 'firebase/app';

/**
 * Errors that retrying can never fix (the rules said no, or the data is malformed).
 * Such writes are dropped instead of blocking every write queued behind them.
 */
export function isPermanentWriteError(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    (error.code === 'permission-denied' || error.code === 'invalid-argument')
  );
}

/** Network trouble (offline, timeout, blocked connection), as opposed to a refused write. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof FirebaseError) {
    return error.code === 'unavailable' || error.code === 'deadline-exceeded';
  }
  return error instanceof Error && /timeout|timed out|network/i.test(error.message);
}

/** Extract code/message from Firebase or generic errors for structured logs. */
export function firebaseErrorMeta(error: unknown): {
  shape: string;
  code?: string;
  message?: string;
} {
  if (error instanceof FirebaseError) {
    return { shape: 'FirebaseError', code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { shape: error.name, message: error.message };
  }
  return { shape: 'unknown' };
}
