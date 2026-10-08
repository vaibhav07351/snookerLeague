import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLinkGoogle } from '@/features/auth/hooks/use-link-google';
import { useSession } from '@/features/auth/hooks/use-session';
import { divisionFromDob, divisionLabel } from '@/features/auth/services/division.service';
import { ProfileGraph } from '@/features/community/components/ProfileGraph';
import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import { profileCompleteness } from '@/features/community/services/profile-completeness';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { LeagueSwitchList } from '@/features/league/components/LeagueSwitchList';
import { inviteUrl, shareLeagueInvite } from '@/features/league/services/invite-link.service';
import { PlayerDashboard } from '@/features/stats/components/PlayerDashboard';
import { useLeagueStats } from '@/features/stats/hooks/use-league-stats';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { LoadingState } from '@/shared/ui/LoadingState';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

/**
 * Your card on one screen: who you are, your key numbers, and the two things you do most
 * (full stats, invite). Settings live behind the gear; sharing and follows in a sheet.
 */
export function ProfileScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { user, league } = useSession();
  const stats = useLeagueStats(league?.id, user?.uid);
  const graph = useFollowGraph(user?.uid ?? null);
  const linkGoogle = useLinkGoogle();
  const [sheet, setSheet] = useState<'league' | 'share' | null>(null);

  if (!user || !league) {
    return null;
  }

  const me = stats.meId ? (stats.playerById.get(stats.meId) ?? null) : null;
  const completeness = profileCompleteness(user, me);
  const subtitle = [
    user.cityName ?? 'City not set',
    user.dateOfBirth ? divisionLabel(divisionFromDob(user.dateOfBirth)) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const gear = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      hitSlop={6}
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
    >
      <Ionicons name="settings-outline" size={22} color={palette.text} />
    </Pressable>
  );

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        {stats.ready ? (
          me ? (
            <PlayerDashboard
              stats={stats}
              playerId={me.id}
              tabs={['overview']}
              columns={3}
              subtitle={subtitle}
              heroRight={gear}
            />
          ) : (
            <View style={styles.noCard}>
              <View style={styles.noCardHead}>
                <Text style={styles.noCardName} numberOfLines={1}>
                  {user.displayName}
                </Text>
                {gear}
              </View>
              <Text style={styles.muted}>{subtitle}</Text>
              <Text style={styles.muted}>
                Your stats appear here once you have played a match or race in {league.name}.
              </Text>
            </View>
          )
        ) : (
          <LoadingState label="Loading your stats" />
        )}

        <View style={styles.pills}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`League ${league.name}. Switch league`}
            onPress={() => setSheet('league')}
            style={({ pressed }) => [styles.pill, styles.pillWide, pressed && styles.pressed]}
          >
            <Ionicons name="trophy-outline" size={15} color={palette.primary} />
            <Text style={styles.pillText} numberOfLines={1}>
              {league.name}
            </Text>
            <Ionicons name="chevron-down" size={14} color={palette.textMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${graph.followers.length} followers, ${graph.following.length} following`}
            onPress={() => router.push(`/(main)/follows?uid=${user.uid}&kind=followers`)}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Ionicons name="people-outline" size={15} color={palette.primary} />
            <Text style={styles.pillText} numberOfLines={1}>
              {graph.followers.length} · {graph.following.length}
            </Text>
          </Pressable>
        </View>

        {completeness.percent < 100 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Profile ${completeness.percent} percent complete. Finish it`}
            onPress={() => setSheet('share')}
            style={({ pressed }) => [styles.complete, pressed && styles.pressed]}
          >
            <View style={styles.completeHead}>
              <Text style={styles.completeText}>Profile {completeness.percent}% complete</Text>
              <Text style={styles.completeAction}>Finish</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${completeness.percent}%` }]} />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Full stats"
            icon="stats-chart-outline"
            variant="secondary"
            style={styles.action}
            onPress={() => router.push('/(main)/stats')}
          />
          <Button
            label="Invite & share"
            icon="qr-code-outline"
            style={styles.action}
            onPress={() => setSheet('share')}
          />
        </View>
      </View>

      <BottomSheet
        visible={sheet === 'league'}
        title="Switch league"
        onClose={() => setSheet(null)}
      >
        <LeagueSwitchList
          onSwitched={() => {
            setSheet(null);
            router.replace('/(main)');
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'share'}
        title="Invite & share"
        onClose={() => setSheet(null)}
      >
        <ProfileGraph
          uid={user.uid}
          displayName={user.displayName}
          completeness={completeness}
          followerCount={graph.followers.length}
          followingCount={graph.following.length}
          onLinkAccount={linkGoogle.available ? () => void linkGoogle.link() : undefined}
          share={{
            label: `Invite to ${league.name}`,
            qrValue: inviteUrl(league.inviteCode),
            qrHint: `Scan to join ${league.name}`,
            onShare: async () => {
              const result = await shareLeagueInvite(league);
              if (result === 'copied') {
                notify.success('Invite copied', 'Paste it into WhatsApp or a message.');
              }
            },
          }}
        />
      </BottomSheet>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minHeight: 0,
      gap: spacing.sm + 2,
    },
    gear: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pressed: {
      opacity: 0.75,
    },
    noCard: {
      flex: 1,
      gap: spacing.sm,
    },
    noCardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    noCardName: {
      flex: 1,
      fontFamily: fonts.display,
      fontSize: 22,
      color: c.text,
    },
    muted: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      color: c.textMuted,
    },
    pills: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radii.pill,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillWide: {
      flex: 1,
      minWidth: 0,
    },
    pillText: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.text,
    },
    complete: {
      gap: 6,
    },
    completeHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    completeText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: c.textMuted,
    },
    completeAction: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.primary,
    },
    track: {
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: c.chartTrack,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: radii.pill,
      backgroundColor: c.primary,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    action: {
      flex: 1,
    },
  });
