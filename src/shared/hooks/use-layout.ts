import { Platform, useWindowDimensions } from 'react-native';

/** Web renders inside a centred phone-width shell (see +html.tsx / root layout). */
export const WEB_SHELL_MAX_WIDTH = 480;

export interface LayoutSize {
  /** Usable app width (window width, capped to the web shell). */
  width: number;
  height: number;
  /** Narrow phones such as iPhone SE / small Androids (under 360 wide). */
  compact: boolean;
  /** Very narrow (under 340), e.g. 320-wide devices. */
  tiny: boolean;
  /** Short screens (under 720 tall): one-screen layouts drop hint lines to fit. */
  short: boolean;
  /** Scale a size designed for a 390-wide phone, clamped so it never grows or shrinks too far. */
  scale: (size: number) => number;
}

export function useLayout(): LayoutSize {
  const { width: windowWidth, height } = useWindowDimensions();
  const width = Platform.OS === 'web' ? Math.min(windowWidth, WEB_SHELL_MAX_WIDTH) : windowWidth;
  const factor = Math.min(1.1, Math.max(0.8, width / 390));
  return {
    width,
    height,
    compact: width < 360,
    tiny: width < 340,
    short: height < 720,
    scale: (size: number) => Math.round(size * factor),
  };
}
