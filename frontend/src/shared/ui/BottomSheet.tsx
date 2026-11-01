import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { WEB_SHELL_MAX_WIDTH } from '@/shared/hooks/use-layout';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

const OPEN_MS = 300;
const CLOSE_MS = 220;
const FADE_MS = 200;
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** How far a release keeps travelling, per px/s of velocity: a quick flick closes it. */
const PROJECTION = 0.2;
/** Reduce motion swaps the slide for this fade; Reanimated would otherwise skip it entirely. */
const REDUCED_FADE = { duration: FADE_MS, reduceMotion: ReduceMotion.Never };
/** Released past this share of its height (after projection), the sheet closes. */
const DISMISS_SHARE = 0.4;

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Panel that slides up over the screen for detail, pickers and secondary actions, so the
 * screen underneath can stay a single, scroll-free view. Long content scrolls inside.
 * Close it with the backdrop, the X, the back button, or by dragging the header down.
 */
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();

  // Stays mounted after `visible` turns false until the closing animation has played.
  const [mounted, setMounted] = useState(visible);
  const measured = useRef(false);
  // Distance below the resting position; starts off screen until the sheet is measured.
  const translateY = useSharedValue(windowHeight);
  const sheetHeight = useSharedValue(windowHeight);
  // Only animates under reduce motion, where the sheet fades instead of sliding.
  const fade = useSharedValue(reduceMotion ? 0 : 1);
  const dragStart = useSharedValue(0);

  const open = useCallback((): void => {
    if (reduceMotion) {
      translateY.value = 0;
      fade.value = withTiming(1, REDUCED_FADE);
    } else {
      fade.value = 1;
      translateY.value = withTiming(0, { duration: OPEN_MS, easing: EASE_SHEET });
    }
  }, [fade, reduceMotion, translateY]);

  const finishClose = useCallback((): void => {
    measured.current = false;
    setMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Reopened while still closing: the content is laid out already, so no onLayout comes.
      if (measured.current) {
        open();
      }
      return;
    }
    if (!mounted) {
      return;
    }
    const done = (finished?: boolean): void => {
      'worklet';
      if (finished) {
        scheduleOnRN(finishClose);
      }
    };
    if (reduceMotion) {
      fade.value = withTiming(0, REDUCED_FADE, done);
    } else {
      // Starts from wherever the sheet is now, so a drag hands straight over to the close.
      translateY.value = withTiming(
        sheetHeight.value,
        { duration: CLOSE_MS, easing: EASE_OUT },
        done,
      );
    }
  }, [visible, mounted, open, finishClose, reduceMotion, fade, translateY, sheetHeight]);

  const onSheetLayout = useCallback(
    (e: LayoutChangeEvent): void => {
      const h = e.nativeEvent.layout.height;
      sheetHeight.value = h;
      if (!measured.current) {
        measured.current = true;
        translateY.value = reduceMotion ? 0 : h;
        open();
      }
    },
    [open, reduceMotion, sheetHeight, translateY],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Needs a clear vertical intent, so taps on the X and sideways swipes stay theirs.
        .activeOffsetY([-10, 10])
        .onStart(() => {
          dragStart.value = translateY.value;
        })
        .onUpdate((e) => {
          translateY.value = Math.max(0, dragStart.value + e.translationY);
        })
        .onEnd((e) => {
          const projected = translateY.value + e.velocityY * PROJECTION;
          if (projected > sheetHeight.value * DISMISS_SHARE) {
            translateY.value = withSpring(
              sheetHeight.value,
              { duration: 300, dampingRatio: 1, velocity: e.velocityY, overshootClamping: true },
              (finished) => {
                if (finished) {
                  scheduleOnRN(onClose);
                }
              },
            );
          } else {
            translateY.value = withSpring(0, {
              duration: 300,
              dampingRatio: 0.8,
              velocity: e.velocityY,
            });
          }
        }),
    [dragStart, onClose, sheetHeight, translateY],
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity:
      fade.value *
      interpolate(translateY.value, [0, sheetHeight.value], [1, 0], Extrapolation.CLAMP),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* A Modal renders outside the app's gesture root, so it needs its own. */}
      <GestureHandlerRootView style={styles.root}>
        {/* iOS needs padding to lift fields inside the sheet; Android resizes the modal window. */}
        <KeyboardAvoidingView
          style={styles.frame}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </Animated.View>
          <Animated.View style={[styles.sheetWrap, sheetStyle]} onLayout={onSheetLayout}>
            <SafeAreaView edges={['bottom']} style={styles.sheet}>
              <GestureDetector gesture={pan}>
                <View>
                  <View style={styles.handle} />
                  <View style={styles.header}>
                    <Text style={styles.title} numberOfLines={1}>
                      {title}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      hitSlop={8}
                      onPress={onClose}
                      style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                    >
                      <Ionicons name="close" size={22} color={palette.textMuted} />
                    </Pressable>
                  </View>
                </View>
              </GestureDetector>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            </SafeAreaView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    frame: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    backdrop: {
      backgroundColor: c.overlay,
    },
    sheetWrap: {
      width: '100%',
      maxWidth: WEB_SHELL_MAX_WIDTH,
      maxHeight: '85%',
    },
    sheet: {
      flexShrink: 1,
      backgroundColor: c.bgElevated,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.border,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: c.borderStrong,
      marginTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
    },
    title: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    close: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    scroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
    },
  });
