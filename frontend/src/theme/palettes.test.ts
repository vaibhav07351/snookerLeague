import { describe, expect, it } from '@jest/globals';

import { PALETTES } from '@/theme/palettes';

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

/** A #RRGGBB colour, or an rgba() one laid over `under` (cards are see-through in dark themes). */
function solid(colour: string, under: string): Rgb {
  const m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(colour);
  if (!m) {
    return parseHex(colour);
  }
  const base = parseHex(under);
  const alpha = Number(m[4]);
  return [1, 2, 3].map((i, k) => Number(m[i]) * alpha + base[k]! * (1 - alpha)) as Rgb;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string, page: string): number {
  const back = solid(bg, page);
  const front = solid(fg, bg.startsWith('#') ? bg : page);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** WCAG AA for body text. */
const AA = 4.5;

describe.each(Object.values(PALETTES))('$name palette contrast', (p) => {
  it.each([
    ['text on the page', p.text, p.bg],
    ['muted text on the page', p.textMuted, p.bg],
    ['muted text on a card', p.textMuted, p.card],
    ['button text on the primary colour', p.onPrimary, p.primary],
  ])('%s reaches AA', (_label, fg, bg) => {
    expect(contrast(fg, bg, p.bg)).toBeGreaterThanOrEqual(AA);
  });
});

describe('light palette (the default) text roles', () => {
  const p = PALETTES.daylight;
  it.each([
    ['hint text on the page', p.textFaint, p.bg],
    ['hint text on a card', p.textFaint, p.card],
    ['gold text on the page', p.primary, p.bg],
    ['gold text on a card', p.primary, p.card],
  ])('%s reaches AA', (_label, fg, bg) => {
    expect(contrast(fg, bg, p.bg)).toBeGreaterThanOrEqual(AA);
  });
});
