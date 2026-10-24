import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional override; defaults to the palette's first chart colour. */
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  maxValue?: number;
  height?: number;
  emptyLabel?: string;
}

export function BarChart({
  data,
  maxValue,
  height = 140,
  emptyLabel = 'Play a few games to unlock this chart',
}: BarChartProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const peak = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }
  const defaultFill = palette.chart[0] ?? palette.primary;

  return (
    <View style={[styles.wrap, { height }]}>
      {data.map((item) => {
        const ratio = Math.max(item.value / peak, 0.04);
        return (
          <View key={item.label} style={styles.col}>
            <Text style={styles.value} numberOfLines={1}>
              {item.value}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    height: `${ratio * 100}%`,
                    backgroundColor: item.color ?? defaultFill,
                  },
                ]}
              />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    col: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      height: '100%',
      justifyContent: 'flex-end',
      gap: 4,
    },
    track: {
      flex: 1,
      width: '100%',
      maxWidth: 36,
      backgroundColor: c.chartTrack,
      borderRadius: radii.xs,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    fill: {
      width: '100%',
      borderRadius: radii.xs,
      minHeight: 6,
    },
    value: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.text,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: c.textMuted,
    },
    empty: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
      paddingVertical: spacing.md,
    },
  });
