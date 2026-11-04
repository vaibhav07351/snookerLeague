import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  GroupStandingRow,
  PointsByPlayer,
} from '@/features/group/services/group-frame-engine';
import { Card } from '@/shared/ui/Card';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface GroupLiveBoardProps {
  /** Players in seat order (the playing order at the table). */
  seatOrder: string[];
  points: PointsByPlayer;
  /** Foul value each player has given away this frame. */
  foulPoints: PointsByPlayer;
  standings: GroupStandingRow[];
  leaders: string[];
  atTablePlayerId: string;
  currentBreak: number;
  nameOf: (playerId: string) => string;
  onSelectPlayer: (playerId: string) => void;
}

/**
 * Frame score for every player, in the order they play. Tap a name to put that player at the
 * table; the app then remembers they come after whoever played last.
 */
export function GroupLiveBoard({
  seatOrder,
  points,
  foulPoints,
  standings,
  leaders,
  atTablePlayerId,
  currentBreak,
  nameOf,
  onSelectPlayer,
}: GroupLiveBoardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const framesWon = new Map(standings.map((r) => [r.playerId, r.framesWon]));
  const anyScore = Object.values(points).some((p) => p > 0);
  const soleLeader = anyScore && leaders.length === 1 ? leaders[0] : null;

  return (
    <Card tone="raised" style={styles.wrap}>
      <View style={styles.legend}>
        <Text style={styles.legendName}>Playing order</Text>
        <Text style={styles.legendNum}>Frames</Text>
        <Text style={styles.legendNum}>Pts</Text>
        <Text style={styles.legendNum}>Foul</Text>
      </View>
      {seatOrder.map((id) => {
        const atTable = id === atTablePlayerId;
        const leading = id === soleLeader;
        return (
          <Pressable
            key={id}
            onPress={() => onSelectPlayer(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: atTable }}
            accessibilityLabel={`${nameOf(id)}, ${points[id] ?? 0} points, ${foulPoints[id] ?? 0} given away in fouls${atTable ? ', at the table' : ''}. Tap to put at the table`}
            style={[styles.row, atTable && styles.rowOn]}
          >
            <View style={[styles.dot, atTable && styles.dotOn]} />
            <Text style={[styles.name, leading && styles.lead]} numberOfLines={1}>
              {nameOf(id)}
              {atTable && currentBreak > 0 ? (
                <Text style={styles.breakText}> · break {currentBreak}</Text>
              ) : null}
            </Text>
            <Text style={styles.frames}>{framesWon.get(id) ?? 0}</Text>
            <Text style={[styles.pts, leading && styles.lead]}>{points[id] ?? 0}</Text>
            <Text style={[styles.fouls, (foulPoints[id] ?? 0) > 0 && styles.foulsOn]}>
              {foulPoints[id] ?? 0}
            </Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 6,
      paddingBottom: 2,
    },
    legendName: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      color: c.textFaint,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    legendNum: {
      minWidth: 40,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      color: c.textFaint,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: TOUCH_TARGET,
      paddingHorizontal: 6,
      marginHorizontal: -6,
      borderRadius: radii.xs,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    rowOn: {
      backgroundColor: c.cardHighlight,
      borderColor: c.borderStrong,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.border,
    },
    dotOn: {
      backgroundColor: c.primary,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: 16,
    },
    breakText: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 13,
    },
    lead: {
      color: c.primary,
      fontFamily: fonts.bodyBold,
    },
    frames: {
      minWidth: 40,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 15,
    },
    fouls: {
      minWidth: 40,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      color: c.textFaint,
      fontSize: 15,
    },
    foulsOn: {
      color: c.danger,
    },
    pts: {
      minWidth: 40,
      textAlign: 'right',
      fontFamily: fonts.display,
      fontSize: 20,
      color: c.text,
    },
  });
