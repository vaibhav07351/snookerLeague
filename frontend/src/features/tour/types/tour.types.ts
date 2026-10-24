import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { WindowRect } from '@/shared/utils/measure';

export type TourIcon = ComponentProps<typeof Ionicons>['name'];

/** Every guided tour in the app. Each plays once per device until replayed from Settings. */
export const TOUR_IDS = [
  'whats-new',
  'home',
  'match-new',
  'live-scoring',
  'league',
  'players',
] as const;

export type TourId = (typeof TOUR_IDS)[number];

/** Spotlight targets, registered by <TourTarget id=...> on the real UI. */
export type TourTargetId =
  | 'home.getting-started'
  | 'home.start-match'
  | 'home.log-race'
  | 'home.feed'
  | 'nav.menu'
  | 'nav.tabs'
  | 'match-new.format'
  | 'match-new.sides'
  | 'match-new.extras'
  | 'match-new.start'
  | 'live.players'
  | 'live.balls'
  | 'live.actions'
  | 'live.fouls'
  | 'live.frame'
  | 'league.list'
  | 'league.invite'
  | 'players.add';

export interface TourStep {
  /** Element to spotlight; null shows the card centred with no spotlight. */
  targetId: TourTargetId | null;
  icon: TourIcon;
  title: string;
  body: string;
  /** Overrides "Next" (or "Done" on the last step). */
  primaryLabel?: string;
}

export interface TourScript {
  id: TourId;
  steps: readonly TourStep[];
  /** Tour that plays straight after this one finishes (not when skipped). */
  next?: TourId;
  /** Label for the dismiss action; defaults to "Skip". */
  skipLabel?: string;
}

/** A measured rectangle in overlay coordinates. */
export type TourRect = WindowRect;
