import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { readPreference, writePreference } from '@/shared/storage/preferences';
import {
  DEFAULT_THEME_ID,
  isThemeId,
  PALETTES,
  type Palette,
  type ThemeId,
} from '@/theme/palettes';

const THEME_PREF_KEY = 'theme';

interface ThemeState {
  palette: Palette;
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
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

export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    let cancelled = false;
    void readPreference(THEME_PREF_KEY).then((saved) => {
      if (!cancelled && isThemeId(saved)) {
        setThemeIdState(saved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const palette = PALETTES[themeId];

  useEffect(() => {
    paintWebDocument(palette);
  }, [palette]);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    void writePreference(THEME_PREF_KEY, id);
  }, []);

  const value = useMemo(() => ({ palette, themeId, setThemeId }), [palette, themeId, setThemeId]);

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
