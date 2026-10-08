import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { foulPointsOf, netRaceScore } from '@/features/race/services/race-helpers';
import type { Race, RacePlace } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

function formatPlace(place: RacePlace | null, livePlace: number): string {
  if (place === 'dnf') {
    return 'OUT';
  }
  if (typeof place === 'number') {
    return `#${place}`;
  }
  if (livePlace === 1) {
    return '1st';
  }
  if (livePlace === 2) {
    return '2nd';
  }
  if (livePlace === 3) {
    return '3rd';
  }
  return `${livePlace}th`;
}

interface RaceLiveBoardProps {
  race: Race;
  /** Compact display name (the caller passes short names, see `shortNames`). */
  nameOf: (playerId: string) => string;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (playerId: string) => void;
}

export function RaceLiveBoard({
  race,
  nameOf,
  selectedPlayerId,
  onSelectPlayer,
}: RaceLiveBoardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const live = [...race.entrants].sort((a, b) => {
    if (a.place === 'dnf' && b.place !== 'dnf') {
      return 1;
    }
    if (b.place === 'dnf' && a.place !== 'dnf') {
      return -1;
    }
    const netDiff = netRaceScore(b) - netRaceScore(a);
    if (netDiff !== 0) {
      return netDiff;
    }
    return 0;
  });

  const livePlaces = new Map<string, number>();
  let cursor = 0;
  for (const e of live) {
    if (e.place === 'dnf') {
      continue;
    }
    cursor += 1;
    livePlaces.set(e.playerId, cursor);
  }

  const leader = live.find((e) => e.place !== 'dnf');
  const leaderNet = leader ? netRaceScore(leader) : 0;
  const tied = live.filter((e) => e.place !== 'dnf' && netRaceScore(e) === leaderNet).length > 1;
  const hasScore = live.some((e) => e.score > 0 || foulPointsOf(e) > 0);
  const leadLabel = !hasScore
    ? 'Level at the top'
    : tied
      ? 'Tied at the top'
      : leader
        ? `${nameOf(leader.playerId)} leading`
        : 'Level at the top';

  return (
    <Card tone="raised" style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.kickerRow}>
          {race.status === 'in_progress' ? <View style={styles.liveDot} /> : null}
          <Text style={styles.kicker}>
            {race.status === 'in_progress' ? 'Live score' : 'Final score'}
          </Text>
        </View>
        <Text style={styles.leadLine} numberOfLines={1}>
          {leadLabel}
        </Text>
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendPts}>Pts</Text>
        <Text style={styles.legendFoul}>Foul</Text>
      </View>
      {live.map((e) => {
        const leading = leader?.playerId === e.playerId && hasScore && !tied;
        const selected = selectedPlayerId === e.playerId;
        const canPick = e.place === null && onSelectPlayer != null;
        const livePlace = livePlaces.get(e.playerId) ?? 0;
        return (
          <Pressable
            key={e.playerId}
            disabled={!canPick}
            onPress={() => onSelectPlayer?.(e.playerId)}
            accessibilityRole={canPick ? 'button' : undefined}
            accessibilityState={canPick ? { selected } : undefined}
            accessibilityLabel={canPick ? `${nameOf(e.playerId)} to play` : undefined}
            style={[styles.row, selected && styles.rowOn]}
          >
            <Text style={[styles.place, leading && styles.lead]}>
              {formatPlace(e.place, livePlace)}
            </Text>
            <Text style={[styles.name, leading && styles.lead]} numberOfLines={1}>
              {nameOf(e.playerId)}
            </Text>
            <Text style={[styles.pts, leading && styles.ptsLead]}>{e.score}</Text>
            <Text style={[styles.fouls, foulPointsOf(e) > 0 && styles.foulsOn]}>
              {foulPointsOf(e)}
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
      marginBottom: spacing.lg,
    },
    head: {
      gap: 2,
    },
    kickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    kicker: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    leadLine: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: 6,
    },
    legendPts: {
      fontFamily: fonts.bodyBold,
      color: c.textFaint,
      fontSize: 10,
      minWidth: 32,
      textAlign: 'right',
    },
    legendFoul: {
      fontFamily: fonts.bodyBold,
      color: c.textFaint,
      fontSize: 10,
      minWidth: 32,
      textAlign: 'right',
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
    place: {
      width: 36,
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 13,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: 16,
    },
    lead: {
      color: c.primary,
      fontFamily: fonts.bodyBold,
    },
    pts: {
      minWidth: 32,
      textAlign: 'right',
      fontFamily: fonts.display,
      fontSize: 20,
      color: c.text,
    },
    ptsLead: {
      color: c.primary,
    },
    fouls: {
      minWidth: 32,
      textAlign: 'right',
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.textFaint,
    },
    foulsOn: {
      color: c.danger,
    },
  });
