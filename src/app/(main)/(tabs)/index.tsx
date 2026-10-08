import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { GettingStartedCard } from '@/features/home/components/GettingStartedCard';
import { Button } from '@/features/home/components/Button';
import { HomeActivityList } from '@/features/home/components/HomeActivityList';
import { HomeFilterChips } from '@/features/home/components/HomeFilterChips';
import { LiveResumeCard } from '@/features/home/components/LiveResumeCard';
import { Screen } from '@/features/home/components/Screen';
import {
  matchResumeCopy,
  raceResumeCopy,
  useLiveSessions,
} from '@/features/home/hooks/use-live-sessions';
import {
  filterLiveForHome,
  homeActivityEmptyCopy,
  listHomeActivity,
  refreshHomeNetworkSources,
  type HomeActivity,
  type HomeFilter,
} from '@/features/home/services/home-feed.service';
import * as matchService from '@/features/match/services/match.service';
import { listPlayers } from '@/features/players/services/players.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { formatLastMatchDay } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

export default function HomeScreen(): ReactNode {
  const { user, league } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const [players, setPlayers] = useState<Player[]>([]);
  const [activity, setActivity] = useState<HomeActivity[]>([]);
  const [lastMatchAt, setLastMatchAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<HomeFilter>('all');

  const leagueId = league?.id;
  const userId = user?.uid;
  const cityId = user?.cityId ?? null;

  const reload = useCallback(async () => {
    if (!leagueId || !userId) {
      return;
    }
    await loadStore();
    const roster = await listPlayers(leagueId);
    setPlayers(roster);
    const store = getStore();
    const me = roster.find((p) => p.authUid === userId);
    setActivity(
      listHomeActivity({
        filter,
        leagueId,
        myPlayerId: me?.id ?? null,
        myUid: userId,
        cityId,
        events: store.events,
        matches: store.matches,
        races: store.races,
      }),
    );
    setLastMatchAt(await matchService.getLastMatchPlayedAt(leagueId));
  }, [leagueId, userId, cityId, filter]);

  useStoreReload(reload, leagueId && userId ? `${leagueId}:${userId}:${filter}:${cityId}` : null);

  useEffect(() => {
    if (filter !== 'network' || !userId) {
      return;
    }
    void refreshHomeNetworkSources({ myUid: userId, cityId });
  }, [filter, userId, cityId]);

  const live = useLiveSessions(leagueId);

  if (!league || !user) {
    return null;
  }

  const me = players.find((p) => p.authUid === user.uid);
  const hasRoster = players.length >= 2;
  const hasHistory = lastMatchAt != null;
  const filteredLive = filterLiveForHome(filter, live.matches, live.races, me?.id ?? null);
  const liveMatches = filteredLive.matches;
  const liveRaces = filteredLive.races;
  const nameOf = live.nameOf;
  const teamTitle = league.reigningTeam
    ? league.reigningTeam.playerIds.map((id) => nameOf(id)).join(' & ')
    : null;
  const raceKing = league.raceKing ? nameOf(league.raceKing.playerId) : null;
  const lastMatchDay = formatLastMatchDay(lastMatchAt);

  const hasLive = liveMatches.length > 0 || liveRaces.length > 0;

  return (
    <Screen>
      <View style={styles.brandRow}>
        <BrandLogo size={48} style={styles.homeLogo} />
        <View style={styles.brandText}>
          <Text style={typography.label} numberOfLines={1}>
            {league.name}
          </Text>
          <BrandWordmark size="sm" />
        </View>
      </View>
      <Text style={styles.greeting} numberOfLines={2}>
        Welcome back, {user.displayName}
      </Text>
      <Text style={styles.lastPlayed}>
        Last match day · <Text style={styles.lastPlayedValue}>{lastMatchDay}</Text>
      </Text>

      <GettingStartedCard
        steps={[
          {
            key: 'player',
            label: 'Pick your player',
            hint: 'Claim your name on the roster so wins count for you.',
            done: me != null,
            onPress: () =>
              router.push({ pathname: '/join/[code]', params: { code: league.inviteCode } }),
          },
          {
            key: 'roster',
            label: 'Add the people you play with',
            hint: 'Add friends as guests now; they can claim their card later.',
            done: hasRoster,
            onPress: () => router.push('/(main)/players'),
          },
          {
            key: 'invite',
            label: 'Invite a friend',
            hint: 'Share the link so they can follow and score live.',
            done: league.memberUids.length > 1,
            onPress: () => router.push('/(main)/league'),
          },
          {
            key: 'match',
            label: 'Score your first match',
            hint: 'Tap balls as they are potted; the app does the maths.',
            done: hasHistory,
            onPress: () => router.push('/match/new'),
          },
        ]}
      />

      {!hasRoster ? (
        <EmptyState
          icon="people-outline"
          title="First: add your table"
          message="Add friends (or guests without the app) so you can pick teams and race entrants."
          actionLabel="Add players"
          onAction={() => router.push('/(main)/players')}
        />
      ) : null}

      <View style={[styles.actions, !hasRoster && styles.actionsAfterGuide]}>
        <Button
          label="Start a match"
          icon="play"
          onPress={() => router.push('/match/new')}
          disabled={!hasRoster || players.length < 2}
        />
        <Button
          label="Log a race"
          icon="flag-outline"
          variant="secondary"
          onPress={() => router.push('/race/new')}
          disabled={!hasRoster}
        />
        {hasRoster && players.length < 2 ? (
          <Text style={styles.ctaHint}>Add at least one more player to log a match.</Text>
        ) : hasRoster && players.length < 4 ? (
          <Text style={styles.ctaHint}>Singles works with 2 · doubles needs 4.</Text>
        ) : null}
        {hasRoster && !hasHistory ? (
          <Text style={styles.ctaHint}>
            Ready to play: log a singles or doubles match, or an individual race. Winners show up
            here.
          </Text>
        ) : null}
      </View>

      <SectionTitle title="Your feed" />
      <HomeFilterChips value={filter} onChange={setFilter} />

      {hasLive ? (
        <View style={styles.liveBlock}>
          <View style={styles.liveHead}>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>Live now</Text>
          </View>
          {liveMatches.map((m) => {
            const copy = matchResumeCopy(m, nameOf);
            return (
              <LiveResumeCard
                key={m.id}
                eyebrow="Live match"
                title={copy.title}
                meta={copy.meta}
                onPress={() => router.push(`/match/${m.id}`)}
              />
            );
          })}
          {liveRaces.map((r) => {
            const copy = raceResumeCopy(r, nameOf);
            return (
              <LiveResumeCard
                key={r.id}
                eyebrow="Live race"
                title={copy.title}
                meta={copy.meta}
                onPress={() => router.push(`/race/${r.id}`)}
              />
            );
          })}
        </View>
      ) : null}

      <Card tone="highlight" style={styles.champCard}>
        <View style={styles.champHead}>
          <Ionicons name="trophy" size={16} color={palette.primary} />
          <Text style={typography.label}>Reigning champions</Text>
        </View>
        <Text style={styles.champNames}>{teamTitle ?? 'Waiting for a crowning match'}</Text>
        {league.reigningTeam?.namedLabel ? (
          <Text style={styles.meta}>{league.reigningTeam.namedLabel}</Text>
        ) : (
          <Text style={styles.meta}>Tip: turn on "Crowns champions" when you log a final</Text>
        )}
      </Card>

      <View style={styles.statStrip}>
        <StatCell label="Race king" value={raceKing ?? '-'} />
        <StatCell label="Your doubles" value={me ? `${me.stats.standard.winPct}%` : '-'} />
        <StatCell label="Race 1sts" value={me ? `${me.stats.race.firstPct}%` : '-'} />
      </View>

      <View style={styles.quickRow}>
        <QuickLink
          icon="stats-chart-outline"
          title="Stats"
          hint="Charts & form"
          onPress={() => router.push('/(main)/stats')}
        />
        <QuickLink
          icon="time-outline"
          title="History"
          hint="Past games"
          onPress={() => router.push('/(main)/history')}
        />
      </View>

      <SectionTitle title="Recent activity" />
      <HomeActivityList items={activity} empty={homeActivityEmptyCopy(filter)} />
    </Screen>
  );
}

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  return (
    <View style={styles.statCol}>
      <Text style={[typography.label, styles.statLabel]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

interface QuickLinkProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  hint: string;
  onPress: () => void;
}

function QuickLink({ icon, title, hint, onPress }: QuickLinkProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}: ${hint}`} style={styles.quick}>
      <View style={styles.quickHead}>
        <Ionicons name={icon} size={18} color={palette.primary} />
        <Text style={styles.quickTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Text style={styles.quickHint} numberOfLines={1}>
        {hint}
      </Text>
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    homeLogo: {
      borderWidth: 1,
      borderColor: c.border,
    },
    brandText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    greeting: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      marginTop: spacing.md,
      fontSize: 20,
      lineHeight: 26,
    },
    lastPlayed: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      marginTop: 2,
      marginBottom: spacing.lg,
    },
    lastPlayedValue: {
      fontFamily: fonts.bodyMedium,
      color: c.text,
    },
    actions: {
      gap: spacing.sm,
    },
    actionsAfterGuide: {
      marginTop: spacing.md,
    },
    ctaHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: 'center',
    },
    liveBlock: {
      marginBottom: spacing.sm,
    },
    liveHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: spacing.sm,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    liveLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.text,
    },
    champCard: {
      marginBottom: spacing.sm,
    },
    champHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    champNames: {
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 28,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    statStrip: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    statCol: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    statLabel: {
      letterSpacing: 0.6,
    },
    statValue: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 18,
    },
    quickRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    quick: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    quickHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    quickTitle: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    quickHint: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
    },
  });
