import { StyleSheet } from 'react-native';

/** Cheerful club-night palette — bright felt, warm sun gold, soft coral pops. */
export const colors = {
  felt: '#0E2A1C',
  feltMid: '#1B4D34',
  feltLight: '#2A6B48',
  chalk: '#FFFDF8',
  chalkMuted: '#C5D9CB',
  gold: '#FFC84A',
  goldSoft: '#FFE39A',
  sun: '#FFB020',
  coral: '#FF7A6E',
  mint: '#5EE4A8',
  sky: '#6EC8FF',
  lavender: '#B8A6FF',
  cue: '#C4894A',
  danger: '#FF6B5C',
  success: '#3DDC97',
  surface: 'rgba(255, 253, 248, 0.08)',
  surfaceRaised: 'rgba(255, 253, 248, 0.12)',
  surfaceBright: 'rgba(255, 200, 74, 0.14)',
  border: 'rgba(255, 253, 248, 0.16)',
  borderStrong: 'rgba(255, 200, 74, 0.45)',
  white: '#FFFFFF',
  overlay: 'rgba(8, 28, 18, 0.55)',
  chartTrack: 'rgba(255, 253, 248, 0.12)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
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

export const typography = {
  brand: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: 0.4,
    color: colors.chalk,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.chalk,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.chalkMuted,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.chalk,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.goldSoft,
  },
};

export const theme = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.felt,
  },
  pad: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
});
