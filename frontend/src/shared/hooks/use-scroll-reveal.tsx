import { createContext, useContext, useMemo, useRef, type RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

import { measureInWindow, type WindowRect } from '@/shared/utils/measure';

/** Time for an animated scrollTo to settle before the caller measures again. */
const SCROLL_SETTLE_MS = 380;

export interface ScrollReveal {
  /** Scroll the nearest scroll container so `node` is comfortably in view. */
  reveal: (node: View | null) => Promise<void>;
}

const ScrollRevealContext = createContext<ScrollReveal | null>(null);

export const ScrollRevealProvider = ScrollRevealContext.Provider;

/** Null outside a scrolling screen: callers then just measure where things are. */
export function useScrollReveal(): ScrollReveal | null {
  return useContext(ScrollRevealContext);
}

/**
 * Backs a ScrollView with the reveal capability. Tracks the scroll offset in a ref (no
 * re-renders) so a target can be scrolled to without native-only measureLayout.
 */
export function useScrollRevealHost(scrollRef: RefObject<ScrollView | null>): {
  value: ScrollReveal;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const offsetRef = useRef(0);

  const value = useMemo<ScrollReveal>(
    () => ({
      reveal: async (node) => {
        const scroll = scrollRef.current;
        if (!scroll || !node) {
          return;
        }
        const [target, viewport] = await Promise.all([
          measureInWindow(node),
          measureInWindow(scroll as unknown as View),
        ]);
        if (!target || !viewport) {
          return;
        }
        const next = revealScrollOffset(target, viewport, offsetRef.current);
        if (next == null || Math.abs(next - offsetRef.current) < 2) {
          return;
        }
        scroll.scrollTo({ y: next, animated: true });
        await new Promise((resolve) => setTimeout(resolve, SCROLL_SETTLE_MS));
      },
    }),
    [scrollRef],
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    offsetRef.current = event.nativeEvent.contentOffset.y;
  };

  return { value, onScroll };
}

/**
 * How far to scroll so a target sits comfortably in view (about a third from the top), or null
 * when it is already fully visible. All rects are in window coordinates.
 */
export function revealScrollOffset(
  target: WindowRect,
  viewport: WindowRect,
  currentOffset: number,
  margin = 96,
): number | null {
  const top = target.y - viewport.y;
  const bottom = top + target.height;
  if (top >= margin && bottom <= viewport.height - margin) {
    return null;
  }
  const desiredTop = Math.max(margin, viewport.height * 0.3 - target.height / 2);
  return Math.max(0, Math.round(currentOffset + top - desiredTop));
}
