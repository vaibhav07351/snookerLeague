import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect } from 'react';
import type { View } from 'react-native';

import * as tourService from '@/features/tour/services/tour.service';
import type { TourId, TourTargetId } from '@/features/tour/types/tour.types';
import type { ScrollReveal } from '@/shared/hooks/use-scroll-reveal';
import { logger } from '@/shared/logging/logger';

/** Let the screen settle (fonts, lists, header) before the first spotlight is measured. */
const AUTO_START_DELAY_MS = 700;

export interface TourTargetHandle {
  getNode: () => View | null;
  /** False while the wrapped content renders nothing (e.g. a dismissed card). */
  hasContent: () => boolean;
  /** The scroll container holding the target, when there is one. */
  reveal: ScrollReveal | null;
}

/** Stable controller: none of these change identity, so screens never re-render from it. */
export interface TourController {
  register: (id: TourTargetId, handle: TourTargetHandle) => () => void;
  startTour: (id: TourId) => void;
  startStory: () => void;
  /** A tour or the welcome story is on screen. */
  isBusy: () => boolean;
  /** Settings > Replay app tour: Home opens with the welcome story next time it shows. */
  requestReplay: () => void;
  consumeReplay: () => boolean;
}

const NOOP_CONTROLLER: TourController = {
  register: () => () => undefined,
  startTour: () => undefined,
  startStory: () => undefined,
  isBusy: () => false,
  requestReplay: () => undefined,
  consumeReplay: () => false,
};

export const TourContext = createContext<TourController>(NOOP_CONTROLLER);

export function useTour(): TourController {
  return useContext(TourContext);
}

/** Plays a screen's tour the first time the screen is focused and its content is ready. */
export function useAutoTour(id: TourId, ready: boolean): void {
  const tour = useTour();
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused || !ready) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      tourService
        .isTourSeen(id)
        .then((seen) => {
          if (!cancelled && !seen && !tour.isBusy()) {
            tour.startTour(id);
          }
        })
        .catch((error: unknown) => {
          logger.warn('tour', 'Auto tour check failed', { tourId: id, error: String(error) });
        });
    }, AUTO_START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [focused, ready, id, tour]);
}

/**
 * Home's greeting: the welcome story for new people, a "what's new" offer for people who
 * already play, then the Home spotlight tour.
 */
export function useFirstRunTour(ready: boolean, hasHistory: boolean): void {
  const tour = useTour();
  const focused = useIsFocused();

  useEffect(() => {
    if (!focused || !ready) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [welcomeSeen, homeTourSeen] = await Promise.all([
            tourService.isWelcomeSeen(),
            tourService.isTourSeen('home'),
          ]);
          if (cancelled || tour.isBusy()) {
            return;
          }
          const action = tourService.decideFirstRun({
            welcomeSeen,
            homeTourSeen,
            hasHistory,
            replay: tour.consumeReplay(),
          });
          if (action === 'story') {
            tour.startStory();
          } else if (action === 'whats-new') {
            await tourService.markWelcomeSeen();
            tour.startTour('whats-new');
          } else if (action === 'home') {
            tour.startTour('home');
          }
        } catch (error) {
          logger.warn('tour', 'First-run check failed', { error: String(error) });
        }
      })();
    }, AUTO_START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [focused, ready, hasHistory, tour]);
}
