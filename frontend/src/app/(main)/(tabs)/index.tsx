import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { GettingStartedCard } from '@/features/home/components/GettingStartedCard';
import { Button } from '@/shared/ui/Button';
import { HomeActivityList } from '@/features/home/components/HomeActivityList';
import { HomeFilterChips } from '@/features/home/components/HomeFilterChips';
import { LiveSessionCards } from '@/features/home/components/LiveSessionCards';
import { UnfinishedGames } from '@/features/home/components/UnfinishedGames';
import { Screen } from '@/shared/ui/Screen';
import { sessionCount, useLiveSessions } from '@/features/home/hooks/use-live-sessions';
import {
  homeActivityEmptyCopy,
  listHomeActivity,
  refreshHomeNetworkSources,
  type HomeActivity,
  type HomeFilter,
} from '@/features/home/services/home-feed.service';
import * as matchService from '@/features/match/services/match.service';
import { listPlayers } from '@/features/players/services/players.service';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useFirstRunTour } from '@/features/tour/hooks/use-tour';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { formatLastMatchDay } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Feed rows shown before "Show more", so the home screen fits without scrolling. */
const FEED_PREVIEW = 4;

export default function HomeScreen(): ReactNode {
  const { user, league } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const [players, setPlayers] = useState<Player[]>([]);
  const [activity, setActivity] = useState<HomeActivity[]>([]);
  const [lastMatchAt, setLastMatchAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [feedExpanded, setFeedExpanded] = useState(false);
  // First load finished: the first-run tour waits for it to know if this person already plays.
  const [loaded, setLoaded] = useState(false);

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
        groupMatches: store.groupMatches,
      }),
    );
    setLastMatchAt(await matchService.getLastMatchPlayedAt(leagueId));
    setLoaded(true);
  }, [leagueId, userId, cityId, filter]);

  useStoreReload(reload, leagueId && userId ? `${leagueId}:${userId}:${filter}:${cityId}` : null);

  useEffect(() => {
    if (filter !== 'network' || !userId) {
      return;
    }
    void refreshHomeNetworkSources({ myUid: userId, cityId });
  }, [filter, userId, cityId]);

  const live = useLiveSessions(leagueId);
  useFirstRunTour(loaded && league != null && user != null, lastMatchAt != null);

  if (!league || !user) {
    return null;
  }

  const me = players.find((p) => p.authUid === user.uid);
  const hasRoster = players.length >= 2;
  const hasHistory = lastMatchAt != null;
  const nameOf = live.nameOf;
  const teamTitle = league.reigningTeam
    ? league.reigningTeam.playerIds.map((id) => nameOf(id)).join(' & ')
    : null;
  const raceKing = league.raceKing ? nameOf(league.raceKing.playerId) : null;
  const lastMatchDay = formatLastMatchDay(lastMatchAt);
  const firstName = user.displayName.trim().split(/\s+/)[0] || user.displayName;
  const shownActivity = feedExpanded ? activity : activity.slice(0, FEED_PREVIEW);
  const ctaHint = !hasRoster
    ? 'Add at least 2 players to start scoring.'
    : players.length < 4
      ? 'Singles works with 2 · free-for-all 3 · doubles 4.'
      : null;

  return (
    <Screen>
      <View style={styles.header}>
        <BrandLogo size={40} style={styles.homeLogo} />
        <View style={styles.headerText}>
          <Text style={styles.greeting} numberOfLines={1}>
            Hi, {firstName}
          </Text>
          <Text style={styles.headerMeta} numberOfLines={1}>
            {league.name} · <Text style={styles.headerMetaValue}>{lastMatchDay}</Text>
          </Text>
        </View>
      </View>

      <TourTarget id="home.getting-started">
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
      </TourTarget>

      {/* Live games sit with the actions, not under the feed chips, so a filter never hides them. */}
      {sessionCount(live.live) > 0 ? (
        <View style={styles.liveBlock}>
          <LiveSessionCards sessions={live.live} nameOf={nameOf} />
        </View>
      ) : null}
      {/* Games idle for 12+ hours stay reachable but collapsed, so they never crowd home. */}
      <UnfinishedGames sessions={live.stale} nameOf={nameOf} />

      <View style={styles.actions}>
        <TourTarget id="home.start-match" style={styles.actionMain}>
          <Button
            label="Start a match"
            icon="play"
            onPress={() => router.push('/match/new')}
            disabled={!hasRoster}
          />
        </TourTarget>
        <TourTarget id="home.log-race" style={styles.actionSide}>
          <Button
            label="Race"
            icon="flag-outline"
            variant="secondary"
            accessibilityLabel="Log a race"
            onPress={() => router.push('/race/new')}
            disabled={!hasRoster}
          />
        </TourTarget>
      </View>
      {ctaHint ? (
        <Text
          style={styles.ctaHint}
          accessibilityRole={!hasRoster ? 'link' : undefined}
          onPress={!hasRoster ? () => router.push('/(main)/players') : undefined}
        >
          {ctaHint}
        </Text>
      ) : null}

      {teamTitle || raceKing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Champion history"
          onPress={() => router.push('/(main)/champions')}
          style={({ pressed }) => [styles.champRow, pressed && styles.pressed]}
        >
          <Ionicons name="trophy" size={16} color={palette.primary} />
          <Text style={styles.champText} numberOfLines={1}>
            {teamTitle ? <Text style={styles.champName}>{teamTitle}</Text> : null}
            {teamTitle && raceKing ? '  ·  ' : null}
            {raceKing ? (
              <>
                Race king <Text style={styles.champName}>{raceKing}</Text>
              </>
            ) : null}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={palette.textFaint} />
        </Pressable>
      ) : null}

      <TourTarget id="home.feed" style={styles.feedHead}>
        <Text style={typography.label}>Feed</Text>
        <HomeFilterChips value={filter} onChange={setFilter} />
      </TourTarget>
      <HomeActivityList items={shownActivity} empty={homeActivityEmptyCopy(filter)} />
      {activity.length > FEED_PREVIEW ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: feedExpanded }}
          hitSlop={8}
          onPress={() => setFeedExpanded((v) => !v)}
          style={styles.more}
        >
          <Text style={styles.moreText}>{feedExpanded ? 'Show less' : 'Show more'}</Text>
          <Ionicons
            name={feedExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={palette.textMuted}
          />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: spacing.md,
    },
    homeLogo: {
      borderWidth: 1,
      borderColor: c.border,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    greeting: {
      fontFamily: fonts.display,
      color: c.text,
      fontSize: 24,
      lineHeight: 30,
    },
    headerMeta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
    },
    headerMetaValue: {
      fontFamily: fonts.bodyMedium,
      color: c.text,
    },
    liveBlock: {
      marginBottom: spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionMain: {
      flex: 2,
      minWidth: 0,
    },
    actionSide: {
      flex: 1,
      minWidth: 0,
    },
    ctaHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    champRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      marginTop: spacing.md,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
    },
    champText: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    champName: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    pressed: {
      opacity: 0.8,
    },
    feedHead: {
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    more: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 40,
    },
    moreText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
    },
  });
