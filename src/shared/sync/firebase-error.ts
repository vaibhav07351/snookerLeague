import { FirebaseError } from 'firebase/app';

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
