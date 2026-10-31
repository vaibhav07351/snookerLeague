import Constants from 'expo-constants';

import { apiErrorMeta, apiRequest } from '@/shared/api/client';
import { isCloudEnabled } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';

/** Parse "1.2.3" (extra parts and suffixes ignored); null when it is not a version. */
export function parseVersion(raw: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True when `current` is older than `minimum`. Unparseable versions never block anyone. */
export function isBelow(current: string, minimum: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(minimum);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! !== b[i]!) {
      return a[i]! < b[i]!;
    }
  }
  return false;
}

export function currentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Ask the server for the oldest app version it still supports. Offline or unreachable means
 * "no answer", never "blocked": a phone in a parlour with no signal must keep scoring.
 */
export async function isUpdateRequired(): Promise<boolean> {
  if (!isCloudEnabled()) {
    return false;
  }
  try {
    const config = await apiRequest<{ minVersion?: string }>('/v1/config', {
      auth: false,
      timeoutMs: 8_000,
    });
    return typeof config.minVersion === 'string' && isBelow(currentAppVersion(), config.minVersion);
  } catch (error) {
    logger.warn('version.service', 'Could not check the minimum version', apiErrorMeta(error));
    return false;
  }
}
