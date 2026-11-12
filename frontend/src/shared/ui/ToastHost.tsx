import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { subscribeToasts, type ToastMessage } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

const VISIBLE_MS = 3200;
const ERROR_VISIBLE_MS = 5000;
const ENTER_MS = 200;
const EXIT_MS = 160;
/** Drops in from just above its resting spot, so it reads as coming from the top edge. */
const ENTER_OFFSET = -12;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Under reduce motion the slide is dropped but the fade stays; Reanimated would skip it.
const ENTER = { duration: ENTER_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.Never };
const EXIT = { duration: EXIT_MS, easing: EASE_OUT, reduceMotion: ReduceMotion.Never };

/** Renders the latest toast at the top of the app. Mount once, near the root. */
export function ToastHost(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const shown = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback((): void => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const hide = useCallback((): void => {
    clearHideTimer();
    shown.value = withTiming(0, EXIT, (finished) => {
      // A new toast that arrives mid-exit interrupts this, and must not be cleared by it.
      if (finished) {
        scheduleOnRN(setToast, null);
      }
    });
  }, [clearHideTimer, shown]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((next) => {
      clearHideTimer();
      setToast(next);
      shown.value = withTiming(1, ENTER);
      hideTimer.current = setTimeout(hide, next.kind === 'error' ? ERROR_VISIBLE_MS : VISIBLE_MS);
    });
    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, [clearHideTimer, hide, shown]);

  const animatedStyle = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: shown.value }
      : {
          opacity: shown.value,
          transform: [{ translateY: (1 - shown.value) * ENTER_OFFSET }],
        },
  );

  if (!toast) {
    return null;
  }

  const tone =
    toast.kind === 'error'
      ? palette.danger
      : toast.kind === 'success'
        ? palette.success
        : palette.info;
  const icon =
    toast.kind === 'error'
      ? 'alert-circle'
      : toast.kind === 'success'
        ? 'checkmark-circle'
        : 'information-circle';

  return (
    <View pointerEvents="box-none" style={[styles.layer, { top: insets.top + spacing.sm }]}>
      <Animated.View style={[styles.toast, { borderLeftColor: tone }, animatedStyle]}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={hide}
          style={styles.row}
        >
          <Ionicons name={icon} size={22} color={tone} />
          <View style={styles.textCol}>
            <Text style={styles.title}>{toast.title}</Text>
            {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    layer: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      zIndex: 1000,
      alignItems: 'center',
    },
    toast: {
      width: '100%',
      maxWidth: 440,
      borderRadius: radii.md,
      backgroundColor: c.bgElevated,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 4,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
    },
    textCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.bodyLarge,
    },
    message: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.small,
      lineHeight: 18,
    },
  });
