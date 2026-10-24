import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';

import { TourOverlay } from '@/features/tour/components/TourOverlay';
import { WelcomeStory } from '@/features/tour/components/WelcomeStory';
import {
  TourContext,
  type TourController,
  type TourTargetHandle,
} from '@/features/tour/hooks/use-tour';
import { spotlightRect } from '@/features/tour/services/tour-layout';
import { TOUR_SCRIPTS } from '@/features/tour/services/tour-scripts';
import * as tourService from '@/features/tour/services/tour.service';
import type { TourId, TourRect, TourStep, TourTargetId } from '@/features/tour/types/tour.types';
import { logger } from '@/shared/logging/logger';
import { measureInWindow } from '@/shared/utils/measure';

type TourState =
  | { kind: 'idle' }
  | { kind: 'story' }
  | {
      kind: 'tour';
      tourId: TourId;
      /** Steps whose target was on screen when the tour began. */
      steps: TourStep[];
      index: number;
      spot: TourRect | null;
      frame: { width: number; height: number };
    };

/** Where a step's spotlight goes: a rect, null for a centred card, or undefined to skip it. */
type Located = { spot: TourRect | null; frame: { width: number; height: number } } | undefined;

/**
 * Hosts the welcome story and every spotlight tour above the whole app. Mount once at the
 * root (next to ToastHost); screens mark targets with <TourTarget> and start tours via hooks.
 */
export function TourProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<TourState>({ kind: 'idle' });
  const stateRef = useRef<TourState>(state);
  stateRef.current = state;
  // A set per id: some targets (the menu button) exist once per tab header.
  const targets = useRef(new Map<TourTargetId, Set<TourTargetHandle>>());
  const originRef = useRef<View>(null);
  const replayRef = useRef(false);
  // The run that is starting a tour (measuring, not on screen yet): still counts as busy.
  const startingRunRef = useRef(-1);
  // Bumped on every step change so a slow measurement can't overwrite a newer step.
  const runRef = useRef(0);
  const screen = useWindowDimensions();

  // Everything below only touches refs and the state setter, so it is built once.
  const engine = useMemo(() => {
    async function locate(step: TourStep): Promise<Located> {
      const origin = await measureInWindow(originRef.current);
      if (!origin) {
        return undefined;
      }
      const frame = { width: origin.width, height: origin.height };
      if (step.targetId == null) {
        return { spot: null, frame };
      }
      // Hidden copies (other tabs) measure as empty or off screen; use the first visible one.
      for (const handle of targets.current.get(step.targetId) ?? []) {
        await handle.reveal?.reveal(handle.getNode());
        const rect = await measureInWindow(handle.getNode());
        if (!rect) {
          continue;
        }
        const local = { ...rect, x: rect.x - origin.x, y: rect.y - origin.y };
        const onScreen =
          local.y + local.height > 0 &&
          local.y < frame.height &&
          local.x + local.width > 0 &&
          local.x < frame.width;
        if (onScreen) {
          return { spot: spotlightRect(local, frame), frame };
        }
      }
      return undefined;
    }

    /** Walk from `index` in `dir` to the first step that can be shown; end the tour if none. */
    async function showFrom(
      tourId: TourId,
      steps: TourStep[] | null,
      index: number,
      dir: 1 | -1,
    ): Promise<void> {
      const run = ++runRef.current;
      // Fixed when the tour starts, so "Step 2 of 5" only counts stops that are on screen.
      const available =
        steps ??
        TOUR_SCRIPTS[tourId].steps.filter((s) => s.targetId == null || hasTarget(s.targetId));
      if (steps == null) {
        startingRunRef.current = run;
      }
      for (let i = index; i >= 0 && i < available.length; i += dir) {
        const step = available[i];
        const located = step ? await locate(step) : undefined;
        if (run !== runRef.current) {
          return;
        }
        if (located) {
          setState({ kind: 'tour', tourId, steps: available, index: i, ...located });
          return;
        }
      }
      if (dir === 1) {
        finish(tourId, true);
      }
    }

    function hasTarget(id: TourTargetId): boolean {
      for (const handle of targets.current.get(id) ?? []) {
        if (handle.hasContent()) {
          return true;
        }
      }
      return false;
    }

    function finish(tourId: TourId, completed: boolean): void {
      runRef.current += 1;
      setState({ kind: 'idle' });
      tourService.markTourSeen(tourId).catch((error: unknown) => {
        logger.warn('tour', 'Could not save tour progress', { tourId, error: String(error) });
      });
      const chained = TOUR_SCRIPTS[tourId].next;
      if (completed && chained) {
        void showFrom(chained, null, 0, 1);
      }
    }

    function next(): void {
      const s = stateRef.current;
      if (s.kind === 'tour') {
        void showFrom(s.tourId, s.steps, s.index + 1, 1);
      }
    }

    function back(): void {
      const s = stateRef.current;
      if (s.kind === 'tour' && s.index > 0) {
        void showFrom(s.tourId, s.steps, s.index - 1, -1);
      }
    }

    function skip(): void {
      const s = stateRef.current;
      if (s.kind === 'tour') {
        finish(s.tourId, false);
      }
    }

    function closeStory(showTour: boolean): void {
      setState({ kind: 'idle' });
      tourService.markWelcomeSeen().catch((error: unknown) => {
        logger.warn('tour', 'Could not save welcome progress', { error: String(error) });
      });
      if (showTour) {
        void showFrom('home', null, 0, 1);
      } else {
        tourService.markTourSeen('home').catch((error: unknown) => {
          logger.warn('tour', 'Could not save tour progress', { error: String(error) });
        });
      }
    }

    return { showFrom, next, back, skip, closeStory };
  }, []);

  // Android back closes the story or skips the tour instead of leaving the screen underneath.
  const busy = state.kind !== 'idle';
  useEffect(() => {
    if (!busy) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stateRef.current.kind === 'story') {
        engine.closeStory(false);
      } else {
        engine.skip();
      }
      return true;
    });
    return () => sub.remove();
  }, [busy, engine]);

  // Rotation / web resize: measure the current step again.
  useEffect(() => {
    const s = stateRef.current;
    if (s.kind === 'tour') {
      void engine.showFrom(s.tourId, s.steps, s.index, 1);
    }
  }, [screen.width, screen.height, engine]);

  const controller = useMemo<TourController>(
    () => ({
      register: (id, handle) => {
        const set = targets.current.get(id) ?? new Set<TourTargetHandle>();
        set.add(handle);
        targets.current.set(id, set);
        return () => {
          set.delete(handle);
        };
      },
      startTour: (id) => {
        void engine.showFrom(id, null, 0, 1);
      },
      startStory: () => {
        runRef.current += 1;
        setState({ kind: 'story' });
      },
      isBusy: () => stateRef.current.kind !== 'idle' || startingRunRef.current === runRef.current,
      requestReplay: () => {
        replayRef.current = true;
      },
      consumeReplay: () => {
        const replay = replayRef.current;
        replayRef.current = false;
        return replay;
      },
    }),
    [engine],
  );

  const current = state.kind === 'tour' ? state : null;
  const currentStep = current?.steps[current.index];

  return (
    <TourContext.Provider value={controller}>
      {children}
      {/* Always mounted: gives the overlay's origin and size (the phone shell on web). */}
      <View
        ref={originRef}
        collapsable={false}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      {/* Elevated layer: Android draws elevated views (the tab bar has 8) above later siblings. */}
      {current && currentStep ? (
        <View pointerEvents="box-none" style={styles.layer}>
          <TourOverlay
            frame={current.frame}
            step={currentStep}
            spot={current.spot}
            position={current.index}
            total={current.steps.length}
            skipLabel={TOUR_SCRIPTS[current.tourId].skipLabel ?? 'Skip'}
            onNext={engine.next}
            onBack={engine.back}
            onSkip={engine.skip}
          />
        </View>
      ) : null}
      {state.kind === 'story' ? (
        <View style={styles.layer}>
          <WelcomeStory onClose={engine.closeStory} />
        </View>
      ) : null}
    </TourContext.Provider>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
  },
});
