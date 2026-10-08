import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface FrameRankView {
  playerId: string;
  name: string;
  side: 'a' | 'b';
  /** Points this player potted. */
  scored: number;
  /** Points this player gave away in fouls. */
  foulPoints: number;
  highestBreak: number;
}

interface FrameLiveRanksProps {
  ranks: FrameRankView[];
  /** Also show each player's best break (match summary). */
  showBreaks?: boolean;
  /** Shown on the left of the column header row, e.g. "This frame". */
  title?: string;
}

/**
 * Players ranked by points potted, one compact line each so it fits above the scoring pad
 * without scrolling. A header row labels the number columns (Pts, Fouls) once.
 */
export function FrameLiveRanks({
  ranks,
  showBreaks = false,
  title,
}: FrameLiveRanksProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  if (ranks.length === 0) {
    return null;
  }
  const sorted = [...ranks].sort(
    (a, b) => b.scored - a.scored || a.foulPoints - b.foulPoints || b.highestBreak - a.highestBreak,
  );
  const top = sorted[0]?.scored ?? 0;

  return (
    <View style={styles.list}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        {showBreaks ? <Text style={[styles.colLabel, styles.statCol]}>Best</Text> : null}
        <Text style={[styles.colLabel, styles.pointsCol]}>Pts</Text>
        <Text style={[styles.colLabel, styles.statCol]}>Foul</Text>
      </View>
      {sorted.map((r, i) => {
        const leading = top > 0 && r.scored === top;
        return (
          <View key={r.playerId} style={[styles.row, leading && styles.rowLeading]}>
            <Text style={[styles.rank, leading && { color: palette.primary }]}>{i + 1}</Text>
            <View style={[styles.dot, { backgroundColor: sideColor(palette, r.side) }]} />
            <Text style={[styles.name, leading && styles.nameLeading]} numberOfLines={1}>
              {r.name}
            </Text>
            {showBreaks ? (
              <Text style={[styles.stat, styles.statCol]} numberOfLines={1}>
                {r.highestBreak > 0 ? r.highestBreak : '-'}
              </Text>
            ) : null}
            <Text style={[styles.points, styles.pointsCol, leading && { color: palette.primary }]}>
              {r.scored}
            </Text>
            <Text
              style={[styles.stat, styles.statCol, r.foulPoints > 0 && { color: palette.danger }]}
              numberOfLines={1}
            >
              {r.foulPoints > 0 ? r.foulPoints : '-'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      gap: 2,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    colLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.textMuted,
      textAlign: 'right',
    },
    pointsCol: {
      width: 36,
    },
    statCol: {
      width: 40,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 26,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
    },
    rowLeading: {
      backgroundColor: c.cardHighlight,
    },
    rank: {
      width: 14,
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.text,
    },
    nameLeading: {
      fontFamily: fonts.bodyBold,
    },
    stat: {
      textAlign: 'right',
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    points: {
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
  });
