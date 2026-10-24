import { StyleSheet } from 'react-native';

import type { Palette } from '@/theme/palettes';

export type { Palette } from '@/theme/palettes';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

export const fonts = {
  display: 'LibreBaskerville_700Bold',
  displayRegular: 'LibreBaskerville_400Regular',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const TOUCH_TARGET = 44;

/** Shared text styles, coloured by the active palette. Use via `useStyles(makeTypography)`. */
export const makeTypography = (c: Palette) =>
  StyleSheet.create({
    brand: {
      fontFamily: fonts.display,
      fontSize: 40,
      letterSpacing: 0.4,
      color: c.text,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 24,
      color: c.text,
    },
    heading: {
      fontFamily: fonts.bodyBold,
      fontSize: 18,
      color: c.text,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: c.textMuted,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: c.text,
    },
    caption: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
  });
