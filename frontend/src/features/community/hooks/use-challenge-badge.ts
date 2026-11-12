import { useCallback, useEffect, useState } from 'react';

import * as challengeService from '@/features/community/services/challenge.service';
import { logger } from '@/shared/logging/logger';
import { useStoreReload } from '@/shared/hooks/use-store-reload';

/**
 * Number of challenges waiting for my answer, for the Community tab badge. Reads this phone's
 * copy on every store change, and asks the server once when the app opens.
 */
export function useChallengeBadge(): number {
  const [count, setCount] = useState(0);
  const reload = useCallback(async () => {
    setCount(await challengeService.countIncomingPending());
  }, []);
  useStoreReload(reload);

  useEffect(() => {
    // The fetch writes new challenges to the store, which re-runs `reload` above.
    challengeService.listMyChallenges().catch((error: unknown) => {
      logger.warn('use-challenge-badge', 'Challenge refresh failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    });
  }, []);

  return count;
}
