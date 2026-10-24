import type { TourRect } from '@/features/tour/types/tour.types';

/** Breathing room between the spotlight and the element it frames. */
export const SPOTLIGHT_PADDING = 8;
/** Gap between the spotlight and the tooltip card. */
export const TOOLTIP_GAP = 14;
/** Keeps the card clear of the screen edges. */
export const EDGE_MARGIN = 16;

export interface Size {
  width: number;
  height: number;
}

/** Grow the target rect by padding, clamped to the overlay so the ring never goes off screen. */
export function spotlightRect(
  target: TourRect,
  overlay: Size,
  padding = SPOTLIGHT_PADDING,
): TourRect {
  const x = Math.max(0, target.x - padding);
  const y = Math.max(0, target.y - padding);
  const right = Math.min(overlay.width, target.x + target.width + padding);
  const bottom = Math.min(overlay.height, target.y + target.height + padding);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export interface TooltipPlacement {
  /** Distance from the overlay top to the card top. */
  top: number;
  side: 'above' | 'below' | 'center';
}

/**
 * Put the card below the spotlight when it fits, otherwise above, otherwise wherever there is
 * more room (clamped on screen). No spotlight centres the card.
 */
export function placeTooltip(
  spot: TourRect | null,
  overlay: Size,
  cardHeight: number,
  insets: { top: number; bottom: number } = { top: 0, bottom: 0 },
): TooltipPlacement {
  const minTop = insets.top + EDGE_MARGIN;
  const maxTop = Math.max(minTop, overlay.height - insets.bottom - EDGE_MARGIN - cardHeight);
  if (!spot) {
    return { top: clamp((overlay.height - cardHeight) / 2, minTop, maxTop), side: 'center' };
  }
  const below = spot.y + spot.height + TOOLTIP_GAP;
  const above = spot.y - TOOLTIP_GAP - cardHeight;
  if (below <= maxTop) {
    return { top: below, side: 'below' };
  }
  if (above >= minTop) {
    return { top: above, side: 'above' };
  }
  const roomBelow = overlay.height - (spot.y + spot.height);
  const side = roomBelow >= spot.y ? 'below' : 'above';
  return { top: clamp(side === 'below' ? below : above, minTop, maxTop), side };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
