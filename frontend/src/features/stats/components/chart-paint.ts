import type { ChartColorKey, ChartDatum } from '@/features/stats/services/insights.service';
import type { Palette } from '@/theme/tokens';

export interface PaintedDatum {
  label: string;
  value: number;
  color: string;
}

/** Resolve a theme-free chart colour key against the active palette. */
export function chartColor(key: ChartColorKey, c: Palette): string {
  if (key.kind === 'tone') {
    return c[key.tone];
  }
  return c.chart[key.index % c.chart.length] ?? c.primary;
}

/** Give each chart row its colour in the current theme. */
export function paint(data: ChartDatum[], c: Palette): PaintedDatum[] {
  return data.map((d) => ({ label: d.label, value: d.value, color: chartColor(d.colorKey, c) }));
}
