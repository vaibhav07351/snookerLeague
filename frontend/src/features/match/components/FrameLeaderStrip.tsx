import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { sortFrameRanks, type FrameRankView } from '@/features/match/components/FrameLiveRanks';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface FrameLeaderStripProps {
  ranks: FrameRankView[];
  /** 'row': one tile per player side by side. 'list': one line per player, stacked. */
  layout?: 'row' | 'list';
}

/** Tiles slide to their new place when the order changes; a reorder is the moment to see. */
const REORDER = LinearTransition.duration(220);

/**
 * The live frame's leaderboard (2 to 4 players), compact enough to sit between the score and
 * the ball pad without pushing the pad off screen: a row of tiles or a stacked list. Players with
 * the same points share a place; nobody is ranked until a ball is potted.
 */
export function FrameLeaderStrip({ ranks, layout = 'row' }: FrameLeaderStripProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  if (ranks.length === 0) {
    return null;
  }
  const sorted = sortFrameRanks(ranks);
  const top = sorted[0]?.scored ?? 0;
  const roomy = sorted.length <= 2;
  const list = layout === 'list';

  return (
    <View
      style={list ? styles.list : styles.row}
      accessibilityRole="summary"
      accessibilityLabel="Frame leaderboard"
    >
      {sorted.map((r) => {
        const place = 1 + sorted.filter((o) => o.scored > r.scored).length;
        const ranked = top > 0;
        const leading = ranked && r.scored === top;
        const a11y = `${ranked ? `Place ${place}, ` : ''}${r.name}, ${r.scored} points${
          r.foulPoints > 0 ? `, ${r.foulPoints} given away in fouls` : ''
        }`;
        if (list) {
          return (
            <Animated.View
              key={r.playerId}
              layout={reduceMotion ? undefined : REORDER}
              accessible
              accessibilityLabel={a11y}
              style={[styles.line, leading && styles.lineLeading]}
            >
              <Text style={[styles.linePlace, leading && { color: palette.primary }]}>
                {ranked ? place : '-'}
              </Text>
              <View style={[styles.dot, { backgroundColor: sideColor(palette, r.side) }]} />
              <Text style={[styles.lineName, leading && styles.nameLeading]} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={[styles.linePoints, leading && { color: palette.primary }]}>
                {r.scored}
              </Text>
              <Text style={[styles.foul, styles.lineFoul]} numberOfLines={1}>
                {r.foulPoints > 0 ? `Foul ${r.foulPoints}` : ''}
              </Text>
            </Animated.View>
          );
        }
        return (
          <Animated.View
            key={r.playerId}
            layout={reduceMotion ? undefined : REORDER}
            accessible
            accessibilityLabel={a11y}
            style={[styles.tile, leading && styles.tileLeading]}
          >
            <View style={styles.nameLine}>
              <Text style={[styles.place, leading && { color: palette.primary }]}>
                {ranked ? place : '-'}
              </Text>
              <View style={[styles.dot, { backgroundColor: sideColor(palette, r.side) }]} />
              <Text style={[styles.name, leading && styles.nameLeading]} numberOfLines={1}>
                {r.name}
              </Text>
            </View>
            <View style={styles.statLine}>
              <Text style={[styles.points, leading && { color: palette.primary }]}>
                {r.scored}
                {roomy ? <Text style={styles.unit}> pts</Text> : null}
              </Text>
              {r.foulPoints > 0 ? (
                <Text style={styles.foul} numberOfLines={1}>
                  {roomy ? `Foul ${r.foulPoints}` : `F${r.foulPoints}`}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 6,
    },
    tile: {
      flex: 1,
      minWidth: 0,
      gap: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    tileLeading: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    nameLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    place: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
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
      fontSize: 12,
      color: c.text,
    },
    nameLeading: {
      fontFamily: fonts.bodyBold,
    },
    statLine: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 4,
    },
    points: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    unit: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: c.textMuted,
    },
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
    linePlace: {
      width: 12,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.textMuted,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    lineName: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.text,
    },
    linePoints: {
      minWidth: 26,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    // Fixed width so every row's points line up, fouls or not.
    lineFoul: {
      width: 46,
      textAlign: 'right',
    },
    foul: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.danger,
      fontVariant: ['tabular-nums'],
    },
  });
