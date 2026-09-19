import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

interface SparklineProps {
  values: number[];
  height?: number;
  color?: string;
  emptyLabel?: string;
}

/** Simple form: 1 = win, 0 = loss, -1 = forfeit loss (harsher). */
export function FormSpark({
  values,
  height = 48,
  color = colors.mint,
  emptyLabel = 'Form appears after a few results',
}: SparklineProps): ReactNode {
  if (values.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  return (
    <View style={[styles.row, { height }]}>
      {values.map((v, i) => {
        const bg = v > 0 ? color : v < 0 ? colors.danger : colors.coral;
        return (
          <View
            key={`${i}-${v}`}
            style={[
              styles.pip,
              v < 0 && styles.pipForfeit,
              {
                backgroundColor: bg,
                opacity: 0.4 + (i / Math.max(values.length - 1, 1)) * 0.6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

export function StatTile({ label, value, hint, accent = colors.gold }: StatTileProps): ReactNode {
  return (
    <View style={[styles.tile, { borderColor: accent }]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pip: {
    flex: 1,
    height: 14,
    borderRadius: radii.pill,
  },
  pipForfeit: {
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.goldSoft,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
  },
  tile: {
    flex: 1,
    minWidth: '45%',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    gap: 4,
  },
  tileLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.chalkMuted,
  },
  tileValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    color: colors.chalk,
  },
  tileHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
});
