import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FrameLiveRanks, type FrameRankView } from '@/features/match/components/FrameLiveRanks';
import type { MatchSummary } from '@/features/match/services/match-summary';
import { Card } from '@/shared/ui/Card';
import { formatDuration } from '@/shared/utils/datetime';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface MatchSummaryCardProps {
  summary: MatchSummary;
  teamALabel: string;
  teamBLabel: string;
  nameOf: (playerId: string) => string;
  title?: string;
}

/** End-of-match totals: points per side and per player, top break and match time. */
export function MatchSummaryCard({
  summary,
  teamALabel,
  teamBLabel,
  nameOf,
  title = 'Match summary total',
}: MatchSummaryCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const ranks: FrameRankView[] = summary.players.map((p) => ({
    playerId: p.playerId,
    name: nameOf(p.playerId),
    side: p.side,
    scored: p.scored,
    foulPoints: p.foulPoints,
    highestBreak: p.highestBreak,
  }));
  const top = summary.topBreak;
  const topName = top
    ? top.playerId
      ? nameOf(top.playerId)
      : top.side === 'a'
        ? teamALabel
        : teamBLabel
    : null;

  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.totals}>
        <Total label={teamALabel} value={summary.totalPointsA} color={palette.teamA} />
        <Total label={teamBLabel} value={summary.totalPointsB} color={palette.teamB} />
      </View>

      {top && top.value > 0 ? (
        <View style={styles.topBreak}>
          <Ionicons name="flame" size={20} color={palette.primary} />
          <View style={styles.topText}>
            <Text style={styles.topLabel}>Highest break</Text>
            <Text style={styles.topValue} numberOfLines={2}>
              <Text style={{ color: sideColor(palette, top.side) }}>{topName}</Text> · {top.value}
            </Text>
          </View>
        </View>
      ) : null}

      <FrameLiveRanks ranks={ranks} showBreaks />

      {summary.totalSeconds != null ? (
        <Text style={styles.meta}>Time at the table: {formatDuration(summary.totalSeconds)}</Text>
      ) : null}
    </Card>
  );
}

function Total({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.total, { borderColor: color }]}>
      <Text style={[styles.totalValue, { color }]}>{value}</Text>
      <Text style={styles.totalLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.totalHint}>total points</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    totals: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    total: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radii.sm,
      borderWidth: 1,
      backgroundColor: c.card,
    },
    totalValue: {
      fontFamily: fonts.display,
      fontSize: 28,
    },
    totalLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
    },
    totalHint: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: c.textMuted,
    },
    topBreak: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: c.cardHighlight,
    },
    topText: {
      flex: 1,
      minWidth: 0,
    },
    topLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    topValue: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
  });
