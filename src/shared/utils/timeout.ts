import { AppError } from '@/shared/errors/app-error';

/** Default for app-owned network reads (Firestore queries outside the sync runtime). */
export const NETWORK_TIMEOUT_MS = 15_000;

/** Reject if `promise` has not settled after `ms`, so a flaky network never hangs a screen. */
export async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  ms: number = NETWORK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AppError('TIMEOUT', `Timed out: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
