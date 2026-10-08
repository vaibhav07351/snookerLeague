import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { radii, spacing, type Palette } from '@/theme/tokens';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'highlight' tints the card with the primary colour (calls to action, live items). */
  tone?: 'default' | 'raised' | 'highlight';
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Standard content panel. Pressable when `onPress` is given. */
export function Card({
  children,
  style,
  tone = 'default',
  onPress,
  accessibilityLabel,
}: CardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const toneStyle =
    tone === 'raised' ? styles.raised : tone === 'highlight' ? styles.highlight : null;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.card, toneStyle, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    raised: {
      backgroundColor: c.cardRaised,
    },
    highlight: {
      backgroundColor: c.cardHighlight,
      borderColor: c.borderStrong,
    },
    pressed: {
      opacity: 0.85,
    },
  });
