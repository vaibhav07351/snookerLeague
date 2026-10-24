import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { usePalette } from '@/theme/ThemeProvider';
import { TOUCH_TARGET } from '@/theme/tokens';

const HOME: Href = '/';

/**
 * Go back if there is history, otherwise replace with `fallback`. Opening a deep link
 * on web (or from a notification) has no history, so a plain `router.back()` would do nothing.
 */
export function useSafeBack(fallback: Href = HOME): () => void {
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  }, [fallback]);
}

interface HeaderBackProps {
  fallback?: Href;
  tintColor?: string;
}

/** Header back arrow that always works (see `useSafeBack`). */
export function HeaderBack({ fallback = HOME, tintColor }: HeaderBackProps): ReactNode {
  const palette = usePalette();
  const goBack = useSafeBack(fallback);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={goBack}
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={26} color={tintColor ?? palette.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
