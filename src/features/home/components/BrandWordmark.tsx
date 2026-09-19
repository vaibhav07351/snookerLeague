import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type WordmarkSize = 'sm' | 'md' | 'lg';

interface BrandWordmarkProps {
  size?: WordmarkSize;
  style?: StyleProp<TextStyle>;
}

const SIZE: Record<WordmarkSize, number> = {
  sm: 28,
  md: 34,
  lg: 44,
};

/** Official name is one word Snookit; visual split is Snook + gold it. */
export function BrandWordmark({ size = 'lg', style }: BrandWordmarkProps): ReactNode {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Snookit"
      style={[styles.base, { fontSize: SIZE[size] }, style]}
    >
      Snook<Text style={styles.it}>it</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: fonts.display,
    color: colors.chalk,
  },
  it: {
    color: colors.gold,
  },
});
