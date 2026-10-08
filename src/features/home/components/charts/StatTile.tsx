import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface SparklineProps {
  values: number[];
  height?: number;
  /** Colour for wins; defaults to the palette's success colour. */
  color?: string;
  emptyLabel?: string;
}

/** Simple form: 1 = win, 0 = loss, -1 = forfeit loss (harsher, outlined). */
export function FormSpark({
  values,
  height = 48,
  color,
  emptyLabel = 'Form appears after a few results',
}: SparklineProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  if (values.length === 0) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }
  const winColor = color ?? palette.success;

  return (
    <View style={[styles.row, { height }]}>
      {values.map((v, i) => {
        const bg = v > 0 ? winColor : palette.danger;
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
  /** Accent for the tile's top edge; defaults to the palette's primary colour. */
  accent?: string;
}

export function StatTile({ label, value, hint, accent }: StatTileProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={[styles.tile, { borderTopColor: accent ?? palette.primary }]}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text style={styles.tileHint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
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
      borderColor: c.text,
    },
    empty: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
    },
    tile: {
      flex: 1,
      minWidth: '45%',
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderTopWidth: 3,
      gap: 4,
    },
    tileLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    tileValue: {
      fontFamily: fonts.bodyBold,
      fontSize: 24,
      color: c.text,
    },
    tileHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
  });
