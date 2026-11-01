import {
  DEFAULT_DARK_THEME_ID,
  isDarkThemeId,
  LIGHT_THEME_ID,
  PALETTES,
  type DarkThemeId,
  type ThemeId,
} from '@/theme/palettes';

/**
 * What the person chose in Settings > Appearance. The app is light unless they opt into dark,
 * whatever the phone is set to; 'system' follows the phone. The dark style is remembered
 * separately so switching modes never loses it.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

export const DEFAULT_THEME_MODE: ThemeMode = 'light';

export interface ThemePreference {
  mode: ThemeMode;
  darkThemeId: DarkThemeId;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  mode: DEFAULT_THEME_MODE,
  darkThemeId: DEFAULT_DARK_THEME_ID,
};

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/** Short summary for the Settings row, e.g. "Dark (Midnight Navy)". */
export function describeAppearance(pref: ThemePreference): string {
  const label = THEME_MODE_LABELS[pref.mode];
  return pref.mode === 'light' ? label : `${label} (${PALETTES[pref.darkThemeId].name})`;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value);
}

/** The palette to paint. `systemScheme` is the phone's setting (null when unknown). */
export function resolveThemeId(
  pref: ThemePreference,
  systemScheme: string | null | undefined,
): ThemeId {
  const dark = pref.mode === 'dark' || (pref.mode === 'system' && systemScheme === 'dark');
  return dark ? pref.darkThemeId : LIGHT_THEME_ID;
}

/**
 * Builds the preference from saved values. Before modes existed a single theme id was saved;
 * a saved dark theme keeps that person in dark with the same style, and the light theme maps
 * to light mode. Nothing saved means the default (light).
 */
export function preferenceFromSaved(saved: {
  mode: string | null;
  darkThemeId: string | null;
  legacyThemeId: string | null;
}): ThemePreference {
  if (isThemeMode(saved.mode)) {
    return {
      mode: saved.mode,
      darkThemeId: isDarkThemeId(saved.darkThemeId) ? saved.darkThemeId : DEFAULT_DARK_THEME_ID,
    };
  }
  if (isDarkThemeId(saved.legacyThemeId)) {
    return { mode: 'dark', darkThemeId: saved.legacyThemeId };
  }
  if (saved.legacyThemeId === LIGHT_THEME_ID) {
    return { mode: 'light', darkThemeId: DEFAULT_DARK_THEME_ID };
  }
  return DEFAULT_THEME_PREFERENCE;
}
