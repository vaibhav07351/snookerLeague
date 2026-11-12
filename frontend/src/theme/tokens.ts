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

/**
 * The app's font sizes. Every `fontSize` comes from here (or from `scale()` of one of these
 * for text that grows on wide screens), so sizes stay few and consistent.
 */
export const typeScale = {
  /** Tab labels, tiny table heads. */
  micro: 10,
  /** Uppercase kickers and section labels. */
  label: 11,
  caption: 12,
  /** Secondary lines, hints, meta. */
  small: 13,
  body: 14,
  bodyLarge: 15,
  /** Names in lists, button labels. */
  lead: 16,
  /** Screen header titles. */
  headline: 17,
  title3: 18,
  title2: 20,
  title1: 22,
  display: 24,
  displayLarge: 28,
  hero: 40,
  /** The big frames score on a result. */
  score: 52,
} as const;

/** Minimum touch target (Apple HIG 44pt, Material 48dp). */
export const TOUCH_TARGET = 44;

/** Shared text styles, coloured by the active palette. Use via `useStyles(makeTypography)`. */
export const makeTypography = (c: Palette) =>
  StyleSheet.create({
    brand: {
      fontFamily: fonts.display,
      fontSize: typeScale.hero,
      letterSpacing: 0.4,
      color: c.text,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: typeScale.display,
      color: c.text,
    },
    heading: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.title3,
      color: c.text,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: typeScale.bodyLarge,
      lineHeight: 22,
      color: c.textMuted,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: typeScale.bodyLarge,
      lineHeight: 22,
      color: c.text,
    },
    caption: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      lineHeight: 17,
      color: c.textMuted,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
  });
