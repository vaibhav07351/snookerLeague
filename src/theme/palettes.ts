/**
 * Colour palettes. Every UI colour comes from a Palette via `useStyles` / `usePalette`,
 * so a theme switch repaints the whole app. Snooker ball colours are fixed (real balls).
 *
 * Token meanings:
 * - bg / bgElevated: screen background / headers, tab bar, drawer
 * - card / cardRaised / cardHighlight: panels, pressed or raised panels, primary-tinted panel
 * - text / textMuted / textFaint: body copy, secondary copy, hints and placeholders
 * - primary / primarySoft / onPrimary: main action colour, its light variant, text on it
 * - teamA / teamB (+ Soft): side colours in matches, so each side reads at a glance
 * - table / tableEdge: the cloth behind the ball pad (green lives here, not everywhere)
 * - live: "live now" indicator
 */
export type ThemeId = 'charcoal' | 'navy' | 'felt' | 'daylight';

export interface Palette {
  id: ThemeId;
  name: string;
  isDark: boolean;
  bg: string;
  bgElevated: string;
  card: string;
  cardRaised: string;
  cardHighlight: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  teamA: string;
  teamASoft: string;
  teamB: string;
  teamBSoft: string;
  table: string;
  tableEdge: string;
  live: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  info: string;
  overlay: string;
  chartTrack: string;
  /** Categorical series colours for charts, in order. */
  chart: readonly string[];
  /** Two soft background glows drawn behind screens. */
  glowA: string;
  glowB: string;
}

const charcoal: Palette = {
  id: 'charcoal',
  name: 'Charcoal & Gold',
  isDark: true,
  bg: '#101317',
  bgElevated: '#171B21',
  card: 'rgba(255, 255, 255, 0.05)',
  cardRaised: 'rgba(255, 255, 255, 0.09)',
  cardHighlight: 'rgba(242, 181, 58, 0.13)',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(242, 181, 58, 0.55)',
  text: '#F4F1EA',
  textMuted: '#A9AFB7',
  textFaint: '#6F7680',
  primary: '#F2B53A',
  primarySoft: '#F8D68E',
  onPrimary: '#1B1404',
  accent: '#B8A6FF',
  teamA: '#5BB2FF',
  teamASoft: 'rgba(91, 178, 255, 0.14)',
  teamB: '#FF9F5A',
  teamBSoft: 'rgba(255, 159, 90, 0.14)',
  table: '#1D5A3C',
  tableEdge: '#123B27',
  live: '#FF5A5F',
  success: '#3DCB8A',
  successSoft: 'rgba(61, 203, 138, 0.14)',
  danger: '#FF6B5C',
  dangerSoft: 'rgba(255, 107, 92, 0.14)',
  warning: '#FFB020',
  info: '#6EC8FF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  chartTrack: 'rgba(255, 255, 255, 0.10)',
  chart: ['#F2B53A', '#5BB2FF', '#FF9F5A', '#B8A6FF', '#3DCB8A', '#FF6B9A'],
  glowA: 'rgba(242, 181, 58, 0.07)',
  glowB: 'rgba(91, 178, 255, 0.05)',
};

const navy: Palette = {
  id: 'navy',
  name: 'Midnight Navy',
  isDark: true,
  bg: '#0B1220',
  bgElevated: '#111A2C',
  card: 'rgba(255, 255, 255, 0.05)',
  cardRaised: 'rgba(255, 255, 255, 0.09)',
  cardHighlight: 'rgba(255, 196, 77, 0.13)',
  border: 'rgba(160, 190, 255, 0.14)',
  borderStrong: 'rgba(255, 196, 77, 0.55)',
  text: '#EEF2FA',
  textMuted: '#9DA9C0',
  textFaint: '#66728A',
  primary: '#FFC44D',
  primarySoft: '#FFDE99',
  onPrimary: '#1A1303',
  accent: '#C3B1FF',
  teamA: '#4FC3F7',
  teamASoft: 'rgba(79, 195, 247, 0.15)',
  teamB: '#FF8A65',
  teamBSoft: 'rgba(255, 138, 101, 0.15)',
  table: '#1B5E43',
  tableEdge: '#103A2A',
  live: '#FF5370',
  success: '#43D29B',
  successSoft: 'rgba(67, 210, 155, 0.14)',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255, 107, 107, 0.15)',
  warning: '#FFB74D',
  info: '#82B1FF',
  overlay: 'rgba(3, 8, 18, 0.65)',
  chartTrack: 'rgba(255, 255, 255, 0.10)',
  chart: ['#FFC44D', '#4FC3F7', '#FF8A65', '#C3B1FF', '#43D29B', '#F48FB1'],
  glowA: 'rgba(79, 195, 247, 0.07)',
  glowB: 'rgba(255, 196, 77, 0.05)',
};

const felt: Palette = {
  id: 'felt',
  name: 'Classic Felt',
  isDark: true,
  bg: '#0D2419',
  bgElevated: '#133224',
  card: 'rgba(255, 253, 248, 0.06)',
  cardRaised: 'rgba(255, 253, 248, 0.10)',
  cardHighlight: 'rgba(255, 200, 74, 0.14)',
  border: 'rgba(255, 253, 248, 0.14)',
  borderStrong: 'rgba(255, 200, 74, 0.5)',
  text: '#FFFDF8',
  textMuted: '#B9C2BC',
  textFaint: '#7D8A82',
  primary: '#FFC84A',
  primarySoft: '#FFE39A',
  onPrimary: '#1E1704',
  accent: '#B8A6FF',
  teamA: '#6EC8FF',
  teamASoft: 'rgba(110, 200, 255, 0.15)',
  teamB: '#FF9F7A',
  teamBSoft: 'rgba(255, 159, 122, 0.15)',
  table: '#1F6B47',
  tableEdge: '#0F3D28',
  live: '#FF6B5C',
  success: '#5EE4A8',
  successSoft: 'rgba(94, 228, 168, 0.14)',
  danger: '#FF6B5C',
  dangerSoft: 'rgba(255, 107, 92, 0.15)',
  warning: '#FFB020',
  info: '#6EC8FF',
  overlay: 'rgba(8, 28, 18, 0.6)',
  chartTrack: 'rgba(255, 253, 248, 0.12)',
  chart: ['#FFC84A', '#6EC8FF', '#FF9F7A', '#B8A6FF', '#5EE4A8', '#FF7AA8'],
  glowA: 'rgba(255, 200, 74, 0.08)',
  glowB: 'rgba(110, 200, 255, 0.05)',
};

const daylight: Palette = {
  id: 'daylight',
  name: 'Daylight',
  isDark: false,
  bg: '#F4F2ED',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardRaised: '#ECE8DF',
  cardHighlight: 'rgba(201, 138, 11, 0.12)',
  border: 'rgba(20, 24, 30, 0.12)',
  borderStrong: 'rgba(201, 138, 11, 0.6)',
  text: '#1A1E24',
  textMuted: '#5A616B',
  textFaint: '#8C939C',
  primary: '#C98A0B',
  primarySoft: '#9A6A06',
  onPrimary: '#FFFFFF',
  accent: '#6A4FD8',
  teamA: '#1F6FD1',
  teamASoft: 'rgba(31, 111, 209, 0.10)',
  teamB: '#D4601C',
  teamBSoft: 'rgba(212, 96, 28, 0.10)',
  table: '#1F6B47',
  tableEdge: '#15503A',
  live: '#E5383B',
  success: '#1E9E64',
  successSoft: 'rgba(30, 158, 100, 0.12)',
  danger: '#D93A2B',
  dangerSoft: 'rgba(217, 58, 43, 0.10)',
  warning: '#C77700',
  info: '#1F6FD1',
  overlay: 'rgba(10, 12, 16, 0.45)',
  chartTrack: 'rgba(20, 24, 30, 0.10)',
  chart: ['#C98A0B', '#1F6FD1', '#D4601C', '#6A4FD8', '#1E9E64', '#C2185B'],
  glowA: 'rgba(201, 138, 11, 0.06)',
  glowB: 'rgba(31, 111, 209, 0.04)',
};

export const PALETTES: Record<ThemeId, Palette> = { charcoal, navy, felt, daylight };

export const THEME_ORDER: readonly ThemeId[] = ['charcoal', 'navy', 'felt', 'daylight'];

export const DEFAULT_THEME_ID: ThemeId = 'charcoal';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in PALETTES;
}

/** Side colour for a match side ('a' | 'b'). */
export function sideColor(palette: Palette, side: 'a' | 'b'): string {
  return side === 'a' ? palette.teamA : palette.teamB;
}

export function sideSoftColor(palette: Palette, side: 'a' | 'b'): string {
  return side === 'a' ? palette.teamASoft : palette.teamBSoft;
}
