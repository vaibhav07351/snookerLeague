import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, typeScale, type Palette } from '@/theme/tokens';

export interface RankedListRow {
  id: string;
  /** What the place column shows: "1", "-", "OUT"... */
  place: string;
  name: string;
  points: number;
  /** Points given away in fouls; shown only when above zero. */
  foulPoints: number;
  leading: boolean;
  /** Small marker before the name (e.g. a team colour). */
  dotColor?: string;
  /** Optional short muted column before the points, e.g. "2 fr". */
  extra?: string;
  /** Faded row, e.g. a player who is out. */
  muted?: boolean;
  accessibilityLabel: string;
}

interface RankedListProps {
  /** Rows already in ranked order. */
  rows: RankedListRow[];
  accessibilityLabel: string;
}

/** Rows slide to their new place when the order changes; a reorder is the moment to see. */
const REORDER = LinearTransition.duration(220);

/** Compact, read-only leaderboard: one short line per player inside a single card. */
export function RankedList({ rows, accessibilityLabel }: RankedListProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  if (rows.length === 0) {
    return null;
  }
  const hasExtra = rows.some((r) => r.extra != null);
  // Longer labels ("#1", "1st", "OUT") get one fixed width so every row's name starts in line.
  const widePlace = rows.some((r) => r.place.length > 1);

  return (
    <View style={styles.list} accessibilityRole="summary" accessibilityLabel={accessibilityLabel}>
      {rows.map((r) => (
        <Animated.View
          key={r.id}
          layout={reduceMotion ? undefined : REORDER}
          accessible
          accessibilityLabel={r.accessibilityLabel}
          style={[styles.line, r.leading && styles.lineLeading, r.muted && styles.muted]}
        >
          <Text
            style={[
              styles.place,
              widePlace && styles.placeWide,
              r.leading && { color: palette.primary },
            ]}
            numberOfLines={1}
          >
            {r.place}
          </Text>
          {r.dotColor ? <View style={[styles.dot, { backgroundColor: r.dotColor }]} /> : null}
          <Text style={[styles.name, r.leading && styles.nameLeading]} numberOfLines={1}>
            {r.name}
          </Text>
          {hasExtra ? (
            <Text style={styles.extra} numberOfLines={1}>
              {r.extra ?? ''}
            </Text>
          ) : null}
          <Text style={[styles.points, r.leading && { color: palette.primary }]}>{r.points}</Text>
          <Text style={styles.foul} numberOfLines={1}>
            {r.foulPoints > 0 ? `Foul ${r.foulPoints}` : ''}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      padding: 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 22,
      paddingHorizontal: 6,
      borderRadius: radii.xs,
    },
    lineLeading: {
      backgroundColor: c.cardHighlight,
    },
    muted: {
      opacity: 0.5,
    },
    place: {
      width: 12,
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      color: c.textMuted,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    placeWide: {
      width: 28,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.text,
    },
    nameLeading: {
      fontFamily: fonts.bodyBold,
    },
    extra: {
      width: 36,
      textAlign: 'right',
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.label,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    points: {
      minWidth: 26,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.body,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    // Fixed width so every row's points line up, fouls or not.
    foul: {
      width: 46,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      color: c.danger,
      fontVariant: ['tabular-nums'],
    },
  });
