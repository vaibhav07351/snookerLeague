import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EDGE_MARGIN, placeTooltip } from '@/features/tour/services/tour-layout';
import type { TourRect, TourStep } from '@/features/tour/types/tour.types';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

const MAX_CARD_WIDTH = 420;
const CARET = 14;
/** Rough first-frame guess until the card reports its real height. */
const ESTIMATED_HEIGHT = 190;

interface TourTooltipProps {
  frame: { width: number; height: number };
  step: TourStep;
  spot: TourRect | null;
  position: number;
  total: number;
  skipLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export function TourTooltip({
  frame,
  step,
  spot,
  position,
  total,
  skipLabel,
  onNext,
  onBack,
  onSkip,
}: TourTooltipProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [cardHeight, setCardHeight] = useState(ESTIMATED_HEIGHT);

  const cardWidth = Math.min(frame.width - EDGE_MARGIN * 2, MAX_CARD_WIDTH);
  const left = (frame.width - cardWidth) / 2;
  const placement = placeTooltip(spot, frame, cardHeight, insets);
  const isLast = position === total - 1;

  const top = useSharedValue(placement.top);
  const enter = useSharedValue(0);

  useEffect(() => {
    top.value = reduceMotion
      ? placement.top
      : withSpring(placement.top, { damping: 20, stiffness: 170 });
  }, [placement.top, reduceMotion, top]);

  // Each new step fades and lifts in, so the change of topic is easy to notice.
  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, {
      duration: reduceMotion ? 0 : 320,
      easing: Easing.out(Easing.cubic),
    });
    AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}`);
  }, [enter, reduceMotion, step]);

  const cardStyle = useAnimatedStyle(() => ({ top: top.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }],
  }));

  // Caret points at the middle of the spotlight, kept inside the card's rounded corners.
  const caretLeft = spot
    ? Math.min(
        Math.max(spot.x + spot.width / 2 - left - CARET / 2, radii.md),
        cardWidth - radii.md - CARET,
      )
    : 0;

  return (
    <Animated.View
      style={[styles.card, { left, width: cardWidth }, cardStyle]}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.height);
        setCardHeight((prev) => (prev === next ? prev : next));
      }}
    >
      {placement.side !== 'center' ? (
        <View
          pointerEvents="none"
          style={[
            styles.caret,
            { left: caretLeft },
            placement.side === 'below' ? styles.caretTop : styles.caretBottom,
          ]}
        />
      ) : null}

      <Animated.View style={[styles.content, contentStyle]}>
        <View style={styles.head}>
          <View style={styles.badge}>
            <Ionicons name={step.icon} size={20} color={palette.primary} />
          </View>
          <View style={styles.headText}>
            {total > 1 ? (
              <Text style={styles.count}>
                Step {position + 1} of {total}
              </Text>
            ) : null}
            <Text style={styles.title} accessibilityRole="header">
              {step.title}
            </Text>
          </View>
        </View>
        <Text style={styles.body}>{step.body}</Text>
      </Animated.View>

      <View style={styles.footer}>
        {total > 1 ? (
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
            {Array.from({ length: total }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, i === position && styles.dotOn, i < position && styles.dotDone]}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          {!isLast ? (
            <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8} style={styles.ghost}>
              <Text style={styles.ghostText}>{skipLabel}</Text>
            </Pressable>
          ) : null}
          {position > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous tip"
              onPress={onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={18} color={palette.text} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={onNext}
            style={({ pressed }) => [styles.next, pressed && styles.pressed]}
          >
            <Text style={styles.nextText}>{step.primaryLabel ?? (isLast ? 'Done' : 'Next')}</Text>
            <Ionicons
              name={isLast ? 'checkmark' : 'arrow-forward'}
              size={16}
              color={palette.onPrimary}
            />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.borderStrong,
      // bgElevated is opaque in every theme; card colours are translucent tints.
      backgroundColor: c.bgElevated,
      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
    },
    caret: {
      position: 'absolute',
      width: CARET,
      height: CARET,
      backgroundColor: c.bgElevated,
      borderColor: c.borderStrong,
      transform: [{ rotate: '45deg' }],
    },
    caretTop: {
      top: -CARET / 2,
      borderTopWidth: 1,
      borderLeftWidth: 1,
    },
    caretBottom: {
      bottom: -CARET / 2,
      borderBottomWidth: 1,
      borderRightWidth: 1,
    },
    content: {
      gap: spacing.sm,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    headText: {
      flex: 1,
      minWidth: 0,
    },
    count: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.primary,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 19,
      lineHeight: 25,
      color: c.text,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: c.textMuted,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    dots: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.chartTrack,
    },
    dotDone: {
      backgroundColor: c.textFaint,
    },
    dotOn: {
      width: 18,
      backgroundColor: c.primary,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    ghost: {
      minHeight: TOUCH_TARGET,
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    ghostText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.textMuted,
    },
    back: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: TOUCH_TARGET / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    next: {
      minHeight: TOUCH_TARGET,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 18,
      borderRadius: radii.pill,
      backgroundColor: c.primary,
    },
    nextText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.onPrimary,
    },
    pressed: {
      opacity: 0.8,
    },
  });
