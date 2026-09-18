import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

export interface BarDatum {
  label: string;
  value: number;
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
  const peak = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={[styles.wrap, { height }]}>
      {data.map((item) => {
        const ratio = Math.max(item.value / peak, 0.04);
        return (
          <View key={item.label} style={styles.col}>
            <Text style={styles.value}>{item.value}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    height: `${ratio * 100}%`,
                    backgroundColor: item.color ?? colors.gold,
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

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 4,
  },
  track: {
    flex: 1,
    width: '100%',
    maxWidth: 36,
    backgroundColor: colors.chartTrack,
    borderRadius: radii.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    borderRadius: radii.sm,
    minHeight: 6,
  },
  value: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.chalk,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.chalkMuted,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.md,
  },
});
