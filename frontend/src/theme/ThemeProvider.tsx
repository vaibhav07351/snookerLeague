import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

import { readPreference, writePreference } from '@/shared/storage/preferences';
import { PALETTES, type DarkThemeId, type Palette, type ThemeId } from '@/theme/palettes';
import {
  DEFAULT_THEME_PREFERENCE,
  preferenceFromSaved,
  resolveThemeId,
  type ThemeMode,
  type ThemePreference,
} from '@/theme/theme-preference';

const MODE_PREF_KEY = 'themeMode';
const DARK_THEME_PREF_KEY = 'darkTheme';
/** Single theme id saved before Light / Dark / System existed; migrated on first read. */
const LEGACY_THEME_PREF_KEY = 'theme';

interface ThemeState {
  palette: Palette;
  /** The palette in use right now (after resolving 'system'). */
  themeId: ThemeId;
  mode: ThemeMode;
  darkThemeId: DarkThemeId;
  /** False until the saved choice is read, so the app never flashes the wrong theme. */
  ready: boolean;
  setMode: (mode: ThemeMode) => void;
  setDarkThemeId: (id: DarkThemeId) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/** Paint the web document behind the app so overscroll and the desktop gutter match the theme. */
function paintWebDocument(palette: Palette): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }
  document.documentElement.style.backgroundColor = palette.bg;
  document.body.style.backgroundColor = palette.bg;
  document.documentElement.style.colorScheme = palette.isDark ? 'dark' : 'light';
}

async function loadPreference(): Promise<ThemePreference> {
  const [mode, darkThemeId, legacyThemeId] = await Promise.all([
    readPreference(MODE_PREF_KEY),
    readPreference(DARK_THEME_PREF_KEY),
    readPreference(LEGACY_THEME_PREF_KEY),
  ]);
  const pref = preferenceFromSaved({ mode, darkThemeId, legacyThemeId });
  if (legacyThemeId !== null) {
    await Promise.all([
      writePreference(MODE_PREF_KEY, pref.mode),
      writePreference(DARK_THEME_PREF_KEY, pref.darkThemeId),
      writePreference(LEGACY_THEME_PREF_KEY, null),
    ]);
  }
  return pref;
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [pref, setPref] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    void loadPreference().then((saved) => {
      if (!cancelled) {
        setPref(saved);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const themeId = resolveThemeId(pref, systemScheme);
  const palette = PALETTES[themeId];

  useEffect(() => {
    paintWebDocument(palette);
  }, [palette]);

  const setMode = useCallback((mode: ThemeMode) => {
    setPref((prev) => ({ ...prev, mode }));
    void writePreference(MODE_PREF_KEY, mode);
  }, []);

  const setDarkThemeId = useCallback((id: DarkThemeId) => {
    setPref((prev) => ({ ...prev, darkThemeId: id }));
    void writePreference(DARK_THEME_PREF_KEY, id);
  }, []);

  const value = useMemo(
    () => ({
      palette,
      themeId,
      mode: pref.mode,
      darkThemeId: pref.darkThemeId,
      ready,
      setMode,
      setDarkThemeId,
    }),
    [palette, themeId, pref.mode, pref.darkThemeId, ready, setMode, setDarkThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export function usePalette(): Palette {
  return useTheme().palette;
}

/**
 * Themed styles. Pass a module-level factory, e.g.
 *   const makeStyles = (c: Palette) => StyleSheet.create({ ... });
 *   const styles = useStyles(makeStyles);
 * Styles are rebuilt only when the palette changes.
 */
export function useStyles<T>(factory: (palette: Palette) => T): T {
  const palette = usePalette();
  return useMemo(() => factory(palette), [factory, palette]);
}
