import { useRef, type ReactNode } from 'react';
import {
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeltAtmosphere } from '@/features/home/components/FeltBackground';
import { spacing, theme } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** When false, children manage their own scroll (e.g. FlatList). Default true. */
  scroll?: boolean;
  /** Override auto header-aware offset. */
  keyboardVerticalOffset?: number;
  edges?: Array<'top' | 'right' | 'bottom' | 'left'>;
}

export function Screen({
  children,
  style,
  contentStyle,
  scroll = true,
  keyboardVerticalOffset,
  edges,
}: ScreenProps): ReactNode {
  const headerHeight = useHeaderHeight();
  const scrollRef = useRef<ScrollView>(null);
  // Header already clears the status bar; only inset top when there is no nav header.
  const resolvedEdges =
    edges ??
    (headerHeight > 0
      ? (['left', 'right', 'bottom'] as const)
      : (['top', 'left', 'right', 'bottom'] as const));
  const offset =
    keyboardVerticalOffset ?? (Platform.OS === 'ios' ? Math.max(headerHeight, 12) : 0);

  function scrollFocusedInputIntoView(target: unknown): void {
    // findNodeHandle / UIManager.measureLayout are native-only.
    if (Platform.OS === 'web' || !scroll || !scrollRef.current) {
      return;
    }
    const handle = findNodeHandle(target as never);
    const scrollHandle = findNodeHandle(scrollRef.current);
    if (handle == null || scrollHandle == null) {
      return;
    }
    // Wait for Android window resize / iOS keyboard inset, then lift the field into view.
    setTimeout(() => {
      UIManager.measureLayout(
        handle,
        scrollHandle,
        () => undefined,
        (_x, y) => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, y - 32),
            animated: true,
          });
        },
      );
    }, 250);
  }

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      bounces
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      contentInsetAdjustmentBehavior="always"
      onFocus={(e) => scrollFocusedInputIntoView(e.target)}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flexContent, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[theme.screen, style]} edges={[...resolvedEdges]}>
      <FeltAtmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
        enabled={Platform.OS === 'ios'}
      >
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // Extra room so bottom fields (e.g. match name) can scroll above the keyboard.
    paddingBottom: spacing.xxl + 120,
  },
});
