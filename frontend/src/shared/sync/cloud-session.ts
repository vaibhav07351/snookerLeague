import { hasSessionFor } from '@/shared/api/tokens';
import { isCloudEnabled } from '@/shared/config/env';
import type { SessionUser } from '@/shared/types/domain';

/**
 * True when this user's changes go to the server: the API is configured, the user signed in
 * with Google (not demo), and this phone still holds a session for them.
 */
export function shouldCloudSync(user: SessionUser | null | undefined): boolean {
  if (!isCloudEnabled() || user == null || user.isDemo) {
    return false;
  }
  return hasSessionFor(user.uid);
}
