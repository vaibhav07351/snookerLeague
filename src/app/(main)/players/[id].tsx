import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BarChart } from '@/features/home/components/charts/BarChart';
import { DonutChart } from '@/features/home/components/charts/DonutChart';
import { FormSpark, StatTile } from '@/features/home/components/charts/StatTile';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
import { buildPlayerInsights } from '@/features/stats/services/insights.service';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { formatDurationCompact } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function PlayerDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    void (async () => {
      await loadStore();
      setPlayer(await playersService.getPlayer(id));
    })();
  }, [id]);

  if (!player) {
    return (
      <Screen>
        <Text style={typography.subtitle}>Loading player…</Text>
      </Screen>
    );
  }

  const store = getStore();
  const insights = buildPlayerInsights(player, store.matches, store.races);

  return (
    <Screen>
      <Text style={typography.title}>{player.displayName}</Text>
      <Text style={styles.kind}>{player.kind === 'guest' ? 'Guest player' : 'League member'}</Text>

      <View style={styles.tiles}>
        <StatTile label="Games" value={String(insights.totalGames)} accent={colors.mint} />
        <StatTile
          label="Win %"
          value={`${insights.doublesWinPct}%`}
          hint={`${insights.doublesWins}W ${insights.doublesLosses}L`}
          accent={colors.gold}
        />
        <StatTile
          label="Race 1sts"
          value={String(insights.raceFirsts)}
          hint={`${insights.raceFirstPct}%`}
          accent={colors.sky}
        />
        <StatTile
          label="Avg place"
          value={insights.avgRacePlace != null ? `#${insights.avgRacePlace}` : '—'}
          hint={`${insights.racePodiums} podiums`}
          accent={colors.lavender}
        />
        <StatTile
          label="Forfeits"
          value={String(insights.forfeits)}
          hint={
            insights.forfeits > 0
              ? `${insights.winsByForfeit} wins by forfeit received`
              : 'Clean record'
          }
          accent={colors.danger}
        />
        <StatTile
          label="Avg frame"
          value={formatDurationCompact(insights.avgFrameSeconds)}
          hint={
            insights.timedFrames > 0
              ? `${insights.timedFrames} timed frames`
              : 'No timed frames yet'
          }
          accent={colors.sun}
        />
        <StatTile
          label="Table time"
          value={formatDurationCompact(insights.totalFrameSeconds || null)}
          hint={
            insights.avgWinFrameSeconds != null
              ? `Wins avg ${formatDurationCompact(insights.avgWinFrameSeconds)}`
              : 'From auto-timed matches'
          }
          accent={colors.mint}
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Form</Text>
        <FormSpark values={insights.form} />
      </View>

      {insights.paceBars.length > 0 ? (
        <View style={styles.card}>
          <Text style={typography.label}>Frame pace (minutes)</Text>
          <Text style={styles.paceHint}>
            Win vs loss frame length
            {insights.fastestFrameSeconds != null
              ? ` · best ${formatDurationCompact(insights.fastestFrameSeconds)}`
              : ''}
          </Text>
          <BarChart data={insights.paceBars} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={typography.label}>Doubles results</Text>
        <DonutChart
          slices={insights.resultDonut}
          centerValue={`${insights.doublesWinPct}%`}
          centerLabel="wins"
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Race places</Text>
        <BarChart data={insights.placeBars} />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Activity</Text>
        <BarChart data={insights.activityBars} />
      </View>

      <Text style={styles.footer}>
        Streak {insights.currentDoublesStreak} · Race 1st streak {insights.currentRaceFirstStreak} ·
        Titles {insights.titles} · Forfeits {insights.forfeits}
        {insights.lastPlayedAt ? ` · Last ${insights.lastPlayedAt.slice(0, 10)}` : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kind: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.lg,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  footer: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  paceHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
});
