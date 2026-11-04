import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GroupStandingRow } from '@/features/group/services/group-frame-engine';
import type { GroupFrame } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

interface GroupResultProps {
  winnerId: string | null;
  standings: GroupStandingRow[];
  frames: GroupFrame[];
  nameOf: (playerId: string) => string;
}

/** Final table of a finished free-for-all match, then each frame's scores. */
export function GroupResult({ winnerId, standings, frames, nameOf }: GroupResultProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();

  return (
    <View style={styles.wrap}>
      {winnerId ? (
        <Card tone="raised" style={styles.winnerCard}>
          <Ionicons name="trophy" size={22} color={palette.primary} />
          <View style={styles.winnerText}>
            <Text style={styles.kicker}>Winner</Text>
            <Text style={styles.winner} numberOfLines={1}>
              {nameOf(winnerId)}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.table}>
        <View style={styles.row}>
          <Text style={[styles.place, styles.head]}>#</Text>
          <Text style={[styles.name, styles.head]}>Player</Text>
          <Text style={[styles.num, styles.head]}>Frames</Text>
          <Text style={[styles.num, styles.head]}>Pts</Text>
        </View>
        {standings.map((row, i) => (
          <View key={row.playerId} style={styles.row}>
            <Text style={styles.place}>{i + 1}</Text>
            <Text style={[styles.name, row.playerId === winnerId && styles.lead]} numberOfLines={1}>
              {nameOf(row.playerId)}
            </Text>
            <Text style={styles.num}>{row.framesWon}</Text>
            <Text style={styles.num}>{row.points}</Text>
          </View>
        ))}
      </Card>

      {frames.length > 0 ? (
        <Card style={styles.table}>
          {frames.map((frame, i) => (
            <View key={i} style={styles.frameRow}>
              <Text style={styles.frameNo}>Frame {i + 1}</Text>
              <Text style={styles.frameLine} numberOfLines={2}>
                {Object.entries(frame.points)
                  .sort(([, a], [, b]) => b - a)
                  .map(([id, pts]) => `${nameOf(id)} ${pts}`)
                  .join(' · ')}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    winnerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    winnerText: {
      flex: 1,
      minWidth: 0,
    },
    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    winner: {
      fontFamily: fonts.display,
      fontSize: 22,
      color: c.text,
    },
    table: {
      gap: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 32,
    },
    head: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textFaint,
    },
    place: {
      width: 20,
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.textMuted,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.text,
    },
    lead: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
    },
    num: {
      minWidth: 48,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    frameRow: {
      gap: 2,
      paddingVertical: 4,
    },
    frameNo: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    frameLine: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: c.text,
    },
  });
