import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { BarChart } from '@/features/home/components/charts/BarChart';
import { DonutChart } from '@/features/home/components/charts/DonutChart';
import { FormSpark, StatTile } from '@/features/home/components/charts/StatTile';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
import { buildPlayerInsights } from '@/features/stats/services/insights.service';
import { getStore, loadStore, subscribeStore } from '@/shared/storage/local-store';
import type { League, Player } from '@/shared/types/domain';
import { formatDurationCompact } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function ProfileScreen(): ReactNode {
  const { user, league, leagues, refresh, switchLeague } = useSession();
  const [player, setPlayer] = useState<Player | null>(null);
  const [tick, setTick] = useState(0);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!league || !user) {
      return;
    }
    await loadStore();
    const me = await playersService.getPlayerByAuthUid(league.id, user.uid);
    setPlayer(me);
  }, [league, user]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  async function onSwitch(target: League): Promise<void> {
    if (!league || target.id === league.id) {
      return;
    }
    setSwitchingId(target.id);
    try {
      await switchLeague(target.id);
      router.replace('/(main)');
    } catch (error) {
      Alert.alert(
        'Could not switch league',
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setSwitchingId(null);
    }
  }

  async function onSignOut(): Promise<void> {
    await authService.signOut();
    await refresh();
    router.replace('/login');
  }

  if (!user || !league) {
    return null;
  }

  const store = getStore();
  const insights = player ? buildPlayerInsights(player, store.matches, store.races) : null;

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.displayName.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={typography.title}>{user.displayName}</Text>
        <Text style={styles.meta}>{league.name}</Text>
        {user.email ? <Text style={styles.meta}>{user.email}</Text> : null}
        <Text style={styles.badge}>{user.isDemo ? 'Local profile' : 'Google account'}</Text>
      </View>

      <Text style={[typography.label, styles.section]}>Your leagues</Text>
      <Text style={styles.sectionHint}>
        Tap a league to switch — home, roster, and stats refresh for that table.
      </Text>
      {leagues.map((l) => {
        const active = l.id === league.id;
        return (
          <Pressable
            key={l.id}
            onPress={() => void onSwitch(l)}
            disabled={switchingId != null}
            style={[styles.leagueRow, active && styles.leagueRowOn]}
          >
            <View style={styles.leagueCopy}>
              <Text style={[styles.leagueName, active && styles.leagueNameOn]}>{l.name}</Text>
              <Text style={styles.leagueMeta}>
                {active ? 'Active now' : switchingId === l.id ? 'Switching…' : 'Tap to switch'}
              </Text>
            </View>
            {active ? <Text style={styles.activeBadge}>ON</Text> : null}
          </Pressable>
        );
      })}
      <Button
        label="Manage leagues"
        variant="ghost"
        onPress={() => router.push('/(main)/league')}
      />

      {insights ? (
        <>
          <Text style={[typography.label, styles.section]}>Stats in {league.name}</Text>
          <View style={styles.tiles}>
            <StatTile label="Games" value={String(insights.totalGames)} accent={colors.mint} />
            <StatTile
              label="Win %"
              value={`${insights.doublesWinPct}%`}
              hint="Match win rate"
              accent={colors.gold}
            />
            <StatTile
              label="Race 1sts"
              value={String(insights.raceFirsts)}
              hint={`${insights.raceFirstPct}%`}
              accent={colors.sky}
            />
            <StatTile label="Titles" value={String(insights.titles)} accent={colors.coral} />
            <StatTile
              label="Forfeits"
              value={String(insights.forfeits)}
              hint="Heavier loss on your record"
              accent={colors.danger}
            />
            <StatTile
              label="Avg frame"
              value={formatDurationCompact(insights.avgFrameSeconds)}
              hint={
                insights.timedFrames > 0
                  ? `${formatDurationCompact(insights.totalFrameSeconds)} table time`
                  : 'Time frames in a match'
              }
              accent={colors.sun}
            />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Your form</Text>
            <FormSpark values={insights.form} />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Match W / L</Text>
            <DonutChart
              slices={insights.resultDonut}
              centerValue={`${insights.doublesWins}`}
              centerLabel="wins"
            />
          </View>

          <View style={styles.card}>
            <Text style={typography.label}>Race places</Text>
            <BarChart data={insights.placeBars} />
          </View>
        </>
      ) : (
        <Text style={typography.subtitle}>Your player card will appear once you’re in a league.</Text>
      )}

      <Button label="Open full stats" variant="secondary" onPress={() => router.push('/(main)/stats')} />
      <View style={styles.spacer} />
      <Button
        label="Log out"
        variant="danger"
        onPress={() => {
          Alert.alert('Log out?', 'You can sign back in anytime.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: () => void onSignOut() },
          ]);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.goldSoft,
    marginBottom: spacing.sm,
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: 36,
    color: colors.felt,
  },
  meta: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
  },
  badge: {
    marginTop: spacing.xs,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.felt,
    backgroundColor: colors.mint,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  section: {
    marginBottom: spacing.xs,
  },
  sectionHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  leagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  leagueRowOn: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBright,
  },
  leagueCopy: {
    flex: 1,
    gap: 2,
  },
  leagueName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.chalk,
  },
  leagueNameOn: {
    color: colors.goldSoft,
  },
  leagueMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  activeBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.felt,
    backgroundColor: colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
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
  spacer: {
    height: spacing.md,
  },
});
