import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BarChart } from '@/features/home/components/charts/BarChart';
import { DonutChart } from '@/features/home/components/charts/DonutChart';
import { FormSpark, StatTile } from '@/features/home/components/charts/StatTile';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
import {
  buildLeagueActivity,
  buildLeagueFoulBoard,
  buildLeagueForfeitBoard,
  buildLeaguePaceBoard,
  buildLeaguePointsBoard,
  buildLeagueTableTimeBoard,
  buildPlayerInsights,
} from '@/features/stats/services/insights.service';
import { refreshLeaguePlayerStats } from '@/features/stats/services/stats.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { formatDurationCompact } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function StatsScreen(): ReactNode {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const leagueId = league?.id;
  const userId = user?.uid;

  const reload = useCallback(async () => {
    if (!leagueId || !userId) {
      return;
    }
    await loadStore();
    const list = await playersService.listPlayers(leagueId);
    setPlayers(list);
    const me = list.find((p) => p.authUid === userId);
    setSelectedId((prev) => prev ?? me?.id ?? list[0]?.id ?? null);
  }, [leagueId, userId]);

  useEffect(() => {
    if (!leagueId) {
      return;
    }
    void refreshLeaguePlayerStats(leagueId);
  }, [leagueId]);

  useStoreReload(reload, leagueId && userId ? `${leagueId}:${userId}` : null);

  if (!league || !user) {
    return null;
  }

  const store = getStore();
  const selected = players.find((p) => p.id === selectedId) ?? null;
  const insights = selected ? buildPlayerInsights(selected, store.matches, store.races) : null;
  const activity = buildLeagueActivity(players);
  const forfeitBoard = buildLeagueForfeitBoard(players);
  const foulBoard = buildLeagueFoulBoard(players);
  const pointsBoard = buildLeaguePointsBoard(players);
  const paceBoard = buildLeaguePaceBoard(players);
  const tableTimeBoard = buildLeagueTableTimeBoard(players);

  return (
    <Screen>
      <Text style={typography.title}>Stats party</Text>
      <Text style={styles.sub}>
        Wins, pace, and table time — pick a player and dig into the numbers.
      </Text>

      <View style={styles.picker}>
        {players.map((p) => {
          const on = p.id === selectedId;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelectedId(p.id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.displayName}</Text>
            </Pressable>
          );
        })}
      </View>

      {!insights ? (
        <Text style={typography.subtitle}>Add players to unlock stats.</Text>
      ) : (
        <>
          <Text style={styles.section}>{insights.player.displayName}</Text>
          <View style={styles.tiles}>
            <StatTile
              label="Games played"
              value={String(insights.totalGames)}
              hint={`${insights.doublesPlayed} doubles · ${insights.racesPlayed} races`}
              accent={colors.mint}
            />
            <StatTile
              label="Doubles win %"
              value={`${insights.doublesWinPct}%`}
              hint={`${insights.doublesWins}W · ${insights.doublesLosses}L`}
              accent={colors.gold}
            />
            <StatTile
              label="Race 1st %"
              value={`${insights.raceFirstPct}%`}
              hint={`${insights.raceFirsts} firsts · ${insights.racePodiums} podiums`}
              accent={colors.sky}
            />
            <StatTile
              label="Titles"
              value={String(insights.titles)}
              hint={`Streak ${insights.currentDoublesStreak} · Race streak ${insights.currentRaceFirstStreak}`}
              accent={colors.coral}
            />
            <StatTile
              label="Points scored"
              value={String(insights.pointsScored)}
              hint={`Net ${insights.netPoints} after fouls`}
              accent={colors.mint}
            />
            <StatTile
              label="Fouls"
              value={String(insights.fouls)}
              hint={
                insights.fouls > 0
                  ? `${insights.foulPoints} pts conceded`
                  : 'No fouls on the shot log'
              }
              accent={colors.coral}
            />
            <StatTile
              label="Forfeits"
              value={String(insights.forfeits)}
              hint={
                insights.forfeits > 0
                  ? 'Walkovers given — heavier loss'
                  : 'No forfeits · keep it clean'
              }
              accent={colors.danger}
            />
            <StatTile
              label="Wins by forfeit"
              value={String(insights.winsByForfeit)}
              hint="Opponent walked"
              accent={colors.gold}
            />
            <StatTile
              label="Avg frame"
              value={formatDurationCompact(insights.avgFrameSeconds)}
              hint={
                insights.timedFrames > 0
                  ? `${insights.timedFrames} timed · ${formatDurationCompact(insights.totalFrameSeconds)} total`
                  : 'Enable auto-time on a match'
              }
              accent={colors.sun}
            />
            <StatTile
              label="Win frame pace"
              value={formatDurationCompact(insights.avgWinFrameSeconds)}
              hint={
                insights.winPaceDeltaSeconds != null
                  ? insights.winPaceDeltaSeconds > 0
                    ? `${formatDurationCompact(insights.winPaceDeltaSeconds)} quicker than losses`
                    : insights.winPaceDeltaSeconds < 0
                      ? `${formatDurationCompact(Math.abs(insights.winPaceDeltaSeconds))} slower than losses`
                      : 'Same pace wins & losses'
                  : 'Needs timed wins & losses'
              }
              accent={colors.mint}
            />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Recent form</Text>
            <Text style={styles.cardHint}>
              Green = win / 1st · Blue-ish coral = loss · Tall red = forfeit loss
            </Text>
            <FormSpark values={insights.form} />
          </View>

          {insights.paceBars.length > 0 ? (
            <View style={styles.card}>
              <Text style={typography.label}>Frame pace (minutes)</Text>
              <Text style={styles.cardHint}>
                How long frames last when their side wins vs loses
                {insights.fastestFrameSeconds != null
                  ? ` · fastest ${formatDurationCompact(insights.fastestFrameSeconds)} · slowest ${formatDurationCompact(insights.slowestFrameSeconds)}`
                  : ''}
              </Text>
              <BarChart data={insights.paceBars} height={140} />
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={typography.label}>Doubles results</Text>
            <DonutChart
              slices={insights.resultDonut}
              centerValue={`${insights.doublesWinPct}%`}
              centerLabel="win rate"
            />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Race places</Text>
            <BarChart data={insights.placeBars} height={150} />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Activity mix</Text>
            <BarChart data={insights.activityBars} height={140} />
          </View>

          {insights.avgRacePlace != null ? (
            <Text style={styles.footer}>
              Avg race finish: #{insights.avgRacePlace}
              {insights.lastPlayedAt ? ` · Last played ${insights.lastPlayedAt.slice(0, 10)}` : ''}
            </Text>
          ) : null}
        </>
      )}

      <Text style={[styles.section, { marginTop: spacing.xl }]}>League hustle</Text>
      <View style={styles.card}>
        <Text style={typography.label}>Games by player</Text>
        <BarChart
          data={activity}
          height={160}
          emptyLabel="No games logged yet — first one’s free glory."
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Points scored</Text>
        <Text style={styles.cardHint}>Pots and free balls from the shot log</Text>
        <BarChart
          data={pointsBoard}
          height={140}
          emptyLabel="No pot points logged yet — tap the balls in a live frame."
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Foul board</Text>
        <Text style={styles.cardHint}>Fouls committed · from the live shot log</Text>
        <BarChart data={foulBoard} height={140} emptyLabel="No fouls logged yet." />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Forfeit board</Text>
        <Text style={styles.cardHint}>Who walked — counts as a greater loss</Text>
        <BarChart
          data={forfeitBoard}
          height={140}
          emptyLabel="Nobody has forfeited yet. Stay classy."
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Frame pace</Text>
        <Text style={styles.cardHint}>Avg minutes per timed frame · quickest first</Text>
        <BarChart
          data={paceBoard}
          height={140}
          emptyLabel="Turn on auto-time in a match to unlock pace."
        />
      </View>

      <View style={styles.card}>
        <Text style={typography.label}>Table time</Text>
        <Text style={styles.cardHint}>Total minutes of timed frames logged</Text>
        <BarChart
          data={tableTimeBoard}
          height={140}
          emptyLabel="No timed frames yet — start the clock mid-match."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: {
    ...typography.subtitle,
    marginBottom: spacing.lg,
  },
  picker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
  },
  chipTextOn: {
    color: colors.felt,
    fontFamily: fonts.bodyBold,
  },
  section: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.chalk,
    marginBottom: spacing.md,
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
  cardHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
    marginBottom: spacing.xs,
  },
  footer: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.lg,
  },
});
