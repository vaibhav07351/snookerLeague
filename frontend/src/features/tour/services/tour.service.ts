import { tourChain } from '@/features/tour/services/tour-scripts';
import { TOUR_IDS, type TourId } from '@/features/tour/types/tour.types';
import { readPreference, writePreference } from '@/shared/storage/preferences';

/**
 * Tour progress is a per-device preference (like dismissed tips): a new phone replays the
 * tour once, which is harmless, and nothing needs syncing.
 */
const TOUR_PREFIX = 'tour.';
const WELCOME_KEY = 'tour.welcome-story';
const SEEN = 'seen';

export async function isTourSeen(id: TourId): Promise<boolean> {
  return (await readPreference(TOUR_PREFIX + id)) === SEEN;
}

export async function isWelcomeSeen(): Promise<boolean> {
  return (await readPreference(WELCOME_KEY)) === SEEN;
}

export async function markWelcomeSeen(): Promise<void> {
  await writePreference(WELCOME_KEY, SEEN);
}

/** Finishing or skipping a tour also settles the tours chained after it. */
export async function markTourSeen(id: TourId): Promise<void> {
  await Promise.all(tourChain(id).map((tour) => writePreference(TOUR_PREFIX + tour, SEEN)));
}

export async function resetTours(): Promise<void> {
  await Promise.all([
    writePreference(WELCOME_KEY, null),
    ...TOUR_IDS.map((id) => writePreference(TOUR_PREFIX + id, null)),
  ]);
}

/** What greets someone landing on Home. */
export type FirstRunAction = 'story' | 'whats-new' | 'home' | 'none';

export interface FirstRunInput {
  welcomeSeen: boolean;
  homeTourSeen: boolean;
  /** Already played in this league: an existing user meeting the tour after an update. */
  hasHistory: boolean;
  /** Asked for from Settings: always open with the welcome story. */
  replay: boolean;
}

export function decideFirstRun(input: FirstRunInput): FirstRunAction {
  if (input.replay) {
    return 'story';
  }
  if (!input.welcomeSeen) {
    return input.hasHistory ? 'whats-new' : 'story';
  }
  return input.homeTourSeen ? 'none' : 'home';
}
