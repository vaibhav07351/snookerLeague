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
import { useKeyboardVisible } from '@/shared/hooks/use-keyboard-visible';
import { ScrollRevealProvider, useScrollRevealHost } from '@/shared/hooks/use-scroll-reveal';
import { useStyles } from '@/theme/ThemeProvider';
import { spacing, type Palette } from '@/theme/tokens';

interface ScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** When false, children manage their own scroll (e.g. FlatList). Default true. */
  scroll?: boolean;
  /** Override auto header-aware offset. */
  keyboardVerticalOffset?: number;
  edges?: Array<'top' | 'right' | 'bottom' | 'left'>;
  /** Pinned below the content (e.g. the screen's main button), so it never scrolls away. */
  footer?: ReactNode;
}

export function Screen({
  children,
  style,
  contentStyle,
  scroll = true,
  keyboardVerticalOffset,
  edges,
  footer,
}: ScreenProps): ReactNode {
  const headerHeight = useHeaderHeight();
  const themed = useStyles(makeThemedStyles);
  const scrollRef = useRef<ScrollView>(null);
  // Lets children (e.g. a tour spotlight) scroll themselves into view.
  const reveal = useScrollRevealHost(scrollRef);
  const keyboardVisible = useKeyboardVisible();
  // Header already clears the status bar; only inset top when there is no nav header.
  const resolvedEdges =
    edges ??
    (headerHeight > 0
      ? (['left', 'right', 'bottom'] as const)
      : (['top', 'left', 'right', 'bottom'] as const));
  const offset = keyboardVerticalOffset ?? (Platform.OS === 'ios' ? Math.max(headerHeight, 12) : 0);

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
      // RN Web: flex:1 alone can disable scroll; a numeric height restores it.
      style={[styles.flex, Platform.OS === 'web' ? styles.webScroll : null]}
      contentContainerStyle={[
        styles.scrollContent,
        keyboardVisible ? styles.keyboardPad : null,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      bounces
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      contentInsetAdjustmentBehavior="always"
      onFocus={(e) => scrollFocusedInputIntoView(e.target)}
      onScroll={reveal.onScroll}
      scrollEventThrottle={32}
    >
      <ScrollRevealProvider value={reveal.value}>{children}</ScrollRevealProvider>
    </ScrollView>
  ) : (
    <View style={[styles.flexContent, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      style={[themed.screen, Platform.OS === 'web' ? styles.webClip : null, style]}
      edges={[...resolvedEdges]}
    >
      <FeltAtmosphere />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={offset}
        enabled={Platform.OS === 'ios'}
      >
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeThemedStyles = (c: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
  });

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  webScroll: {
    height: 0,
  },
  // Clip felt blobs so they don't expand document width on web.
  webClip: {
    overflow: 'hidden',
    width: '100%',
  },
  flexContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    // Let nested FlatLists shrink/scroll inside the phone shell on web.
    ...(Platform.OS === 'web' ? { minHeight: 0, overflow: 'hidden' as const } : {}),
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  // Only while the keyboard is open: room for the last field to scroll above it. Keeping this
  // pad permanently made screens that fit scroll anyway.
  keyboardPad: {
    paddingBottom: spacing.xxl + 120,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
});
