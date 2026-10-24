import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { TourTooltip } from '@/features/tour/components/TourTooltip';
import type { TourRect, TourStep } from '@/features/tour/types/tour.types';
import { usePalette } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';

/**
 * The dim layer is one view with a huge border around a transparent middle: its inner
 * rounded edge is the spotlight. Plain views animate on native and web alike (no SVG mask).
 */
const DIM_BORDER = 3000;
const SPOT_RADIUS = radii.md;
const SPRING = { damping: 20, stiffness: 170, mass: 0.9 } as const;

export interface TourOverlayProps {
  /** Overlay size (the app frame, which is the phone-width shell on web). */
  frame: { width: number; height: number };
  step: TourStep;
  /** Padded spotlight in overlay coordinates; null centres the card with no spotlight. */
  spot: TourRect | null;
  position: number;
  total: number;
  skipLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function TourOverlay({
  frame,
  step,
  spot,
  position,
  total,
  skipLabel,
  onNext,
  onBack,
  onSkip,
}: TourOverlayProps): ReactNode {
  const palette = usePalette();
  const reduceMotion = useReducedMotion();

  // A centred step closes the spotlight to a point in the middle of the screen.
  const target = spot ?? { x: frame.width / 2, y: frame.height / 2, width: 0, height: 0 };
  const x = useSharedValue(target.x);
  const y = useSharedValue(target.y);
  const w = useSharedValue(target.width);
  const h = useSharedValue(target.height);
  const fade = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, { duration: reduceMotion ? 0 : 260 });
  }, [fade, reduceMotion]);

  useEffect(() => {
    const move = (sv: typeof x, to: number): void => {
      sv.value = reduceMotion ? withTiming(to, { duration: 0 }) : withSpring(to, SPRING);
    };
    move(x, target.x);
    move(y, target.y);
    move(w, target.width);
    move(h, target.height);
  }, [target.x, target.y, target.width, target.height, reduceMotion, x, y, w, h]);

  useEffect(() => {
    if (reduceMotion || !spot) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion, spot]);

  const dimStyle = useAnimatedStyle(() => ({
    left: x.value - DIM_BORDER,
    top: y.value - DIM_BORDER,
    width: w.value + DIM_BORDER * 2,
    height: h.value + DIM_BORDER * 2,
    borderRadius: Math.min(SPOT_RADIUS, w.value / 2, h.value / 2) + DIM_BORDER,
    opacity: fade.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    borderRadius: Math.min(SPOT_RADIUS, w.value / 2, h.value / 2),
    opacity: fade.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
    borderRadius: Math.min(SPOT_RADIUS, w.value / 2, h.value / 2),
    opacity: (1 - pulse.value) * 0.7 * fade.value,
    // Grow the ring by a fixed ~8px each side whatever the target size.
    transform: [
      { scaleX: 1 + (pulse.value * 16) / Math.max(w.value, 1) },
      { scaleY: 1 + (pulse.value * 16) / Math.max(h.value, 1) },
    ],
  }));

  return (
    <View
      style={StyleSheet.absoluteFill}
      accessibilityViewIsModal
      // Swallow touches so nothing behind the tour is pressed by accident.
      onStartShouldSetResponder={() => true}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.dim, { borderColor: palette.scrim }, dimStyle]}
      />
      {spot ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { borderColor: palette.primary }, pulseStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { borderColor: palette.primary, boxShadow: `0 0 18px ${palette.primary}` },
              ringStyle,
            ]}
          />
          {/* Tapping the highlighted element moves on, so it feels like part of the app. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. Next tip`}
            onPress={onNext}
            style={[
              styles.spotHit,
              { left: spot.x, top: spot.y, width: spot.width, height: spot.height },
            ]}
          />
        </>
      ) : null}
      <TourTooltip
        frame={frame}
        step={step}
        spot={spot}
        position={position}
        total={total}
        skipLabel={skipLabel}
        onNext={onNext}
        onBack={onBack}
        onSkip={onSkip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    borderWidth: DIM_BORDER,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  spotHit: {
    position: 'absolute',
  },
});
