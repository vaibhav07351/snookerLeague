import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors, fonts, spacing } from '@/theme/tokens';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
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
  emptyLabel = 'No data yet — go win something!',
}: DonutChartProps): ReactNode {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={colors.chartTrack}
              strokeWidth={stroke}
              fill="transparent"
            />
            {slices
              .filter((s) => s.value > 0)
              .map((slice) => {
                const length = (slice.value / total) * circumference;
                const dashOffset = -offset;
                offset += length;
                return (
                  <Circle
                    key={slice.label}
                    cx={size / 2}
                    cy={size / 2}
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
        {slices.map((s) => (
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

const styles = StyleSheet.create({
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
    color: colors.chalk,
  },
  centerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
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
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
    fontSize: 13,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.md,
  },
});
