import { describe, expect, it, jest } from '@jest/globals';

// tour.service persists to device storage; these tests only use its pure helpers.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { placeTooltip, spotlightRect, TOOLTIP_GAP } from '@/features/tour/services/tour-layout';
import { TOUR_SCRIPTS, tourChain } from '@/features/tour/services/tour-scripts';
import {
  decideFirstRun,
  isTourSeen,
  markTourSeen,
  resetTours,
} from '@/features/tour/services/tour.service';
import { TOUR_IDS } from '@/features/tour/types/tour.types';
import { revealScrollOffset } from '@/shared/hooks/use-scroll-reveal';

const phone = { width: 390, height: 844 };

describe('decideFirstRun', () => {
  const base = { welcomeSeen: false, homeTourSeen: false, hasHistory: false, replay: false };

  it('shows the welcome story to someone new', () => {
    expect(decideFirstRun(base)).toBe('story');
  });

  it('offers the tour instead of the story to someone who already plays', () => {
    expect(decideFirstRun({ ...base, hasHistory: true })).toBe('whats-new');
  });

  it('resumes the home tour when the story was seen but the tour was not', () => {
    expect(decideFirstRun({ ...base, welcomeSeen: true })).toBe('home');
  });

  it('stays quiet once everything was seen', () => {
    expect(decideFirstRun({ ...base, welcomeSeen: true, homeTourSeen: true })).toBe('none');
  });

  it('always opens with the story when replayed from Settings', () => {
    expect(
      decideFirstRun({ welcomeSeen: true, homeTourSeen: true, hasHistory: true, replay: true }),
    ).toBe('story');
  });
});

describe('tour scripts', () => {
  it('defines every tour with at least one step', () => {
    for (const id of TOUR_IDS) {
      expect(TOUR_SCRIPTS[id].id).toBe(id);
      expect(TOUR_SCRIPTS[id].steps.length).toBeGreaterThan(0);
    }
  });

  it('chains the what-is-new offer into the home tour', () => {
    expect(tourChain('whats-new')).toEqual(['whats-new', 'home']);
    expect(tourChain('home')).toEqual(['home']);
  });

  it('skipping the offer also settles the home tour, and reset brings both back', async () => {
    await markTourSeen('whats-new');
    expect(await isTourSeen('whats-new')).toBe(true);
    expect(await isTourSeen('home')).toBe(true);
    await resetTours();
    expect(await isTourSeen('home')).toBe(false);
  });
});

describe('spotlightRect', () => {
  it('pads the target', () => {
    expect(spotlightRect({ x: 20, y: 100, width: 100, height: 40 }, phone, 8)).toEqual({
      x: 12,
      y: 92,
      width: 116,
      height: 56,
    });
  });

  it('clamps to the screen edges', () => {
    const rect = spotlightRect({ x: 0, y: 820, width: 390, height: 60 }, phone, 8);
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(390);
    expect(rect.y + rect.height).toBe(844);
  });
});

describe('placeTooltip', () => {
  it('goes below the spotlight when there is room', () => {
    const spot = { x: 16, y: 120, width: 358, height: 52 };
    expect(placeTooltip(spot, phone, 200)).toEqual({
      top: 120 + 52 + TOOLTIP_GAP,
      side: 'below',
    });
  });

  it('flips above a spotlight near the bottom (e.g. the tab bar)', () => {
    const spot = { x: 0, y: 760, width: 390, height: 84 };
    const placement = placeTooltip(spot, phone, 200);
    expect(placement.side).toBe('above');
    expect(placement.top).toBe(760 - TOOLTIP_GAP - 200);
  });

  it('centres the card when there is no spotlight', () => {
    expect(placeTooltip(null, phone, 200)).toEqual({ top: 322, side: 'center' });
  });

  it('stays on screen when the target fills the screen', () => {
    const spot = { x: 0, y: 40, width: 390, height: 780 };
    const placement = placeTooltip(spot, phone, 200, { top: 24, bottom: 20 });
    expect(placement.top).toBeGreaterThanOrEqual(24);
    expect(placement.top + 200).toBeLessThanOrEqual(844 - 20);
  });
});

describe('revealScrollOffset', () => {
  const viewport = { x: 0, y: 100, width: 390, height: 600 };

  it('leaves a visible target alone', () => {
    expect(revealScrollOffset({ x: 0, y: 300, width: 390, height: 50 }, viewport, 0)).toBeNull();
  });

  it('scrolls down to a target below the fold', () => {
    const offset = revealScrollOffset({ x: 0, y: 1200, width: 390, height: 50 }, viewport, 40);
    expect(offset).not.toBeNull();
    // After scrolling, the target sits inside the viewport.
    const newTop = 1200 - 100 - ((offset ?? 0) - 40);
    expect(newTop).toBeGreaterThanOrEqual(96);
    expect(newTop + 50).toBeLessThanOrEqual(600 - 96);
  });

  it('never scrolls above the top of the content', () => {
    expect(revealScrollOffset({ x: 0, y: 60, width: 390, height: 50 }, viewport, 10)).toBe(0);
  });
});
