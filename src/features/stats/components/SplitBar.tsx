import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

/** Which way is better for this stat; 'neutral' highlights nobody. */
export type Better = 'higher' | 'lower' | 'neutral';

export interface SplitBarData {
  key: string;
  label: string;
  a: number | null;
  b: number | null;
  aText: string;
  bText: string;
  better: Better;
}

interface SplitBarProps {
  row: SplitBarData;
}

function leader(row: SplitBarData): 'a' | 'b' | null {
  if (row.better === 'neutral' || row.a == null || row.b == null || row.a === row.b) {
    return null;
  }
  const aBetter = row.better === 'higher' ? row.a > row.b : row.a < row.b;
  return aBetter ? 'a' : 'b';
}

/** One stat, two players: bars grow out from the centre and the leader is highlighted. */
export function SplitBar({ row }: SplitBarProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const lead = leader(row);
  const peak = Math.max(Math.abs(row.a ?? 0), Math.abs(row.b ?? 0), 1);
  const share = (v: number | null): number => (v == null ? 0 : Math.max(Math.abs(v) / peak, 0.04));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${row.label}: ${row.aText} versus ${row.bText}`}
    >
      <View style={styles.values}>
        <Text style={[styles.value, lead === 'a' && styles.valueLead]} numberOfLines={1}>
          {row.aText}
        </Text>
        <Text style={styles.label} numberOfLines={1}>
          {row.label}
        </Text>
        <Text
          style={[styles.value, styles.valueRight, lead === 'b' && styles.valueLead]}
          numberOfLines={1}
        >
          {row.bText}
        </Text>
      </View>
      <View style={styles.bars}>
        <View style={[styles.half, styles.halfLeft]}>
          <View
            style={[
              styles.fill,
              {
                width: `${share(row.a) * 100}%`,
                backgroundColor: lead === 'a' ? palette.teamA : palette.chartTrack,
              },
            ]}
          />
        </View>
        <View style={styles.half}>
          <View
            style={[
              styles.fill,
              {
                width: `${share(row.b) * 100}%`,
                backgroundColor: lead === 'b' ? palette.teamB : palette.chartTrack,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      maxHeight: 64,
      minHeight: 40,
      justifyContent: 'center',
      gap: 4,
    },
    values: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    value: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.textMuted,
    },
    valueRight: {
      textAlign: 'right',
    },
    valueLead: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      color: c.textMuted,
      textAlign: 'center',
    },
    bars: {
      flexDirection: 'row',
      gap: 4,
      height: 6,
    },
    half: {
      flex: 1,
      borderRadius: radii.pill,
      backgroundColor: c.card,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    halfLeft: {
      flexDirection: 'row-reverse',
    },
    fill: {
      height: '100%',
      borderRadius: radii.pill,
    },
  });
