import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGoogleSignIn } from '@/features/auth/hooks/use-google-sign-in';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { divisionFromDob, divisionLabel } from '@/features/auth/services/division.service';
import { ProfileGraph } from '@/features/community/components/ProfileGraph';
import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import { profileCompleteness } from '@/features/community/services/profile-completeness';
import { BarChart } from '@/features/home/components/charts/BarChart';
import { DonutChart } from '@/features/home/components/charts/DonutChart';
import { FormSpark, StatTile } from '@/features/home/components/charts/StatTile';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
import { buildPlayerInsights } from '@/features/stats/services/insights.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { isFirebaseEnabled } from '@/shared/firebase/app';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { League, Player } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { formatDurationCompact } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function ProfileScreen(): ReactNode {
  const { user, league, leagues, refresh, switchLeague } = useSession();
  const [player, setPlayer] = useState<Player | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const { ready: googleReady, promptIdToken } = useGoogleSignIn();

  const leagueId = league?.id;
  const userId = user?.uid;
  const graph = useFollowGraph(userId ?? null);

  const reload = useCallback(async () => {
    if (!leagueId || !userId) {
      return;
    }
    await loadStore();
    const me = await playersService.getPlayerByAuthUid(leagueId, userId);
    setPlayer(me);
  }, [leagueId, userId]);

  useStoreReload(reload, leagueId && userId ? `${leagueId}:${userId}` : null);

  async function onLinkGoogle(): Promise<void> {
    if (!user?.isDemo) {
      return;
    }
    if (!isFirebaseEnabled()) {
      Alert.alert(
        'Cloud not set up',
        'Add Firebase config and enable Google sign-in to link an account.',
      );
      return;
    }
    if (!googleReady) {
      Alert.alert('Please wait', 'Google sign-in is still loading. Try again in a moment.');
      return;
    }
    const ok = await confirmAction(
      'Link Google account?',
      'Your local leagues and match history will move to this Google login and start syncing to the cloud.',
      'Continue with Google',
    );
    if (!ok) {
      return;
    }
    // Let the confirm dialog finish dismissing before opening Google UI.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 400);
    });
    try {
      const idToken = await promptIdToken();
      if (!idToken) {
        return;
      }
      setLinkingGoogle(true);
      await authService.linkDemoAccountWithGoogleIdToken(idToken);
      await refresh();
      Alert.alert(
        'Google linked',
        'Your leagues and matches stay on this device and will sync to the cloud when online.',
      );
    } catch (error) {
      Alert.alert('Could not link Google', toUserMessage(error));
    } finally {
      setLinkingGoogle(false);
    }
  }

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
    const ok = await confirmAction('Log out?', 'You can sign back in anytime.', 'Log out');
    if (!ok) {
      return;
    }
    try {
      await authService.signOut();
      await refresh();
      router.replace('/login');
    } catch (error) {
      Alert.alert(
        'Could not log out',
        error instanceof Error ? error.message : 'Something went wrong',
      );
    }
  }

  if (!user || !league) {
    return null;
  }

  const store = getStore();
  const insights = player ? buildPlayerInsights(player, store.matches, store.races) : null;
  const canLinkGoogle = user.isDemo && isFirebaseEnabled();

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.displayName.trim().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={typography.title}>{user.displayName}</Text>
        <Text style={styles.meta}>{user.cityName ?? 'City not set'}</Text>
        <Text style={styles.meta}>
          {user.dateOfBirth ? divisionLabel(divisionFromDob(user.dateOfBirth)) : 'Division not set'}
        </Text>
        <Text style={styles.meta}>{league.name}</Text>
        {user.email ? <Text style={styles.meta}>{user.email}</Text> : null}
        <Text style={styles.badge}>{user.isDemo ? 'Local profile' : 'Google account'}</Text>
      </View>

      <ProfileGraph
        uid={user.uid}
        displayName={user.displayName}
        completeness={profileCompleteness(user, player)}
        followerCount={graph.followers.length}
        followingCount={graph.following.length}
      />

      {canLinkGoogle ? (
        <View style={styles.linkCard}>
          <Text style={typography.label}>Backup & sync</Text>
          <Text style={styles.sectionHint}>
            You started with a local name. Link Google to keep this data and sync it to the cloud.
          </Text>
          <Button
            label="Continue with Google"
            variant="secondary"
            loading={linkingGoogle}
            disabled={linkingGoogle || !googleReady}
            onPress={() => void onLinkGoogle()}
          />
        </View>
      ) : null}

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
        label={user.cityId ? 'Change city' : 'Choose city'}
        variant="ghost"
        onPress={() => router.push('/location')}
      />
      <Button
        label={user.dateOfBirth ? 'Change date of birth' : 'Add date of birth'}
        variant="ghost"
        onPress={() => router.push('/birthday')}
      />

      {insights ? (
        <>
          <Text style={[typography.label, styles.section]}>Stats in {league.name}</Text>
          <View style={styles.tiles}>
            <StatTile
              label="Highest break"
              value={String(player?.stats.standard.highestBreak || '—')}
              hint={`${player?.stats.standard.centuries ?? 0} centuries`}
              accent={colors.gold}
            />
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
              label="Points scored"
              value={String(player?.stats.standard.pointsScored || 0)}
              hint={`Net ${player?.stats.standard.netPoints ?? 0}`}
              accent={colors.mint}
            />
            <StatTile
              label="Fouls"
              value={String(player?.stats.standard.fouls || 0)}
              hint={`${player?.stats.standard.foulPoints ?? 0} pts conceded`}
              accent={colors.coral}
            />
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
        <Text style={typography.subtitle}>
          Your player card will appear once you’re in a league.
        </Text>
      )}

      <Button
        label="Open full stats"
        variant="secondary"
        onPress={() => router.push('/(main)/stats')}
      />
      <View style={styles.spacer} />
      <Button
        label="Log out"
        variant="danger"
        onPress={() => {
          void onSignOut();
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
  linkCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    gap: spacing.sm,
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
