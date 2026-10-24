import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, type Palette } from '@/theme/tokens';

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

/** Official name is one word Snookit; visual split is Snook + primary-coloured it. */
export function BrandWordmark({ size = 'lg', style }: BrandWordmarkProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Snookit"
      numberOfLines={1}
      style={[styles.base, { fontSize: SIZE[size] }, style]}
    >
      Snook<Text style={styles.it}>it</Text>
    </Text>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    base: {
      fontFamily: fonts.display,
      color: c.text,
    },
    it: {
      color: c.primary,
    },
  });
