import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { useLayout } from '@/shared/hooks/use-layout';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

export interface DonutSlice {
  label: string;
  value: number;
  /** Optional override; defaults to the palette's chart colour at the slice's index. */
  color?: string;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  emptyLabel?: string;
}

export function DonutChart({
  slices,
  size = 160,
  centerLabel,
  centerValue,
  emptyLabel = 'No data yet, go win something!',
}: DonutChartProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { scale } = useLayout();
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  // Shrink on narrow phones, never grow past the requested size.
  const px = Math.min(size, scale(size));
  const stroke = 18;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colored = slices.map((slice, index) => ({
    ...slice,
    color: slice.color ?? palette.chart[index % palette.chart.length] ?? palette.primary,
  }));
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <View style={{ width: px, height: px }}>
        <Svg width={px} height={px}>
          <G transform={`rotate(-90 ${px / 2} ${px / 2})`}>
            <Circle
              cx={px / 2}
              cy={px / 2}
              r={radius}
              stroke={palette.chartTrack}
              strokeWidth={stroke}
              fill="transparent"
            />
            {colored
              .filter((s) => s.value > 0)
              .map((slice) => {
                const length = (slice.value / total) * circumference;
                const dashOffset = -offset;
                offset += length;
                return (
                  <Circle
                    key={slice.label}
                    cx={px / 2}
                    cy={px / 2}
                    r={radius}
                    stroke={slice.color}
                    strokeWidth={stroke}
                    fill="transparent"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                  />
                );
              })}
          </G>
        </Svg>
        <View style={styles.center}>
          {centerValue ? <Text style={styles.centerValue}>{centerValue}</Text> : null}
          {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
        </View>
      </View>
      <View style={styles.legend}>
        {colored.map((s) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>
              {s.label} · {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
      flexWrap: 'wrap',
    },
    center: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerValue: {
      fontFamily: fonts.bodyBold,
      fontSize: 22,
      color: c.text,
    },
    centerLabel: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    legend: {
      gap: spacing.sm,
      flex: 1,
      minWidth: 120,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: 13,
    },
    empty: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.md,
    },
  });
