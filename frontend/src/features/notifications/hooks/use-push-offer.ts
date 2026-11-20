import { useCallback } from 'react';

import * as pushService from '@/features/notifications/services/push.service';
import { logger } from '@/shared/logging/logger';
import { confirmAction } from '@/shared/utils/confirm';

/** Moments where a notification clearly helps the person. */
export type PushMoment = 'challenge_sent' | 'followed' | 'city_joined';

const COPY: Record<PushMoment, { title: string; message: string }> = {
  challenge_sent: {
    title: 'Know when they answer?',
    message:
      'Turn on notifications and Snookit tells you when your challenge is accepted, and when someone challenges or follows you. Nothing else.',
  },
  followed: {
    title: 'Get a notice when you are challenged?',
    message:
      'Turn on notifications and Snookit tells you when someone challenges you, accepts your challenge or follows you. Nothing else.',
  },
  city_joined: {
    title: 'Hear when someone challenges you?',
    message:
      'You are on your city board now. Turn on notifications and Snookit tells you when a player there challenges or follows you. Nothing else.',
  },
};

/**
 * Offer notifications right after something they help with. Shows the app's own sheet first
 * and asks the phone only after "Turn on", at most once a month, never when already decided.
 */
export function usePushOffer(): (moment: PushMoment) => Promise<void> {
  return useCallback(async (moment: PushMoment): Promise<void> => {
    try {
      if ((await pushService.pushOfferState()) !== 'offer') {
        return;
      }
      await pushService.notePushOffered();
      const { title, message } = COPY[moment];
      if (await confirmAction(title, message, 'Turn on')) {
        await pushService.enablePush();
      }
    } catch (error) {
      logger.warn('use-push-offer', 'Push offer failed', {
        moment,
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }, []);
}
