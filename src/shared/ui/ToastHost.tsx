import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeToasts, type ToastMessage } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

const VISIBLE_MS = 3200;
const ERROR_VISIBLE_MS = 5000;

/** Renders the latest toast at the top of the app. Mount once, near the root. */
export function ToastHost(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const useNative = Platform.OS !== 'web';
    const hide = (): void => {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: useNative }).start(
        () => setToast(null),
      );
    };
    const unsubscribe = subscribeToasts((next) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setToast(next);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: useNative }).start();
      hideTimer.current = setTimeout(hide, next.kind === 'error' ? ERROR_VISIBLE_MS : VISIBLE_MS);
    });
    return () => {
      unsubscribe();
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [opacity]);

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
      <Animated.View style={[styles.toast, { borderLeftColor: tone, opacity }]}>
        <Pressable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          onPress={() => setToast(null)}
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
      fontSize: 15,
    },
    message: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
  });
