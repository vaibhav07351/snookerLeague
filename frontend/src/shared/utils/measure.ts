import type { View } from 'react-native';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Callback never fires for a view that unmounted mid-measure; give up after this. */
const MEASURE_TIMEOUT_MS = 500;

/**
 * Where a view sits in window coordinates. Works on native and react-native-web (unlike
 * UIManager.measureLayout). Resolves null when the view is gone or has no size.
 */
export function measureInWindow(node: View | null): Promise<WindowRect | null> {
  if (!node) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), MEASURE_TIMEOUT_MS);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      const valid = [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
      resolve(valid ? { x, y, width, height } : null);
    });
  });
}
