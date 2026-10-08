import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { CommunityHubTiles } from '@/features/community/components/CommunityHubTiles';
import { Button } from '@/features/home/components/Button';
import { LiveResumeCard } from '@/features/home/components/LiveResumeCard';
import { Screen } from '@/features/home/components/Screen';
import {
  matchResumeCopy,
  raceResumeCopy,
  useLiveSessions,
} from '@/features/home/hooks/use-live-sessions';
import { listPlayers } from '@/features/players/services/players.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player } from '@/shared/types/domain';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

export default function MySnookerScreen(): ReactNode {
  const { user, league } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const [players, setPlayers] = useState<Player[]>([]);
  const leagueId = league?.id;
  const { matches: liveMatches, races: liveRaces, nameOf } = useLiveSessions(leagueId);

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    setPlayers(await listPlayers(leagueId));
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  if (!user || !league) {
    return null;
  }

  const hasRoster = players.length >= 2;
  const hasLive = liveMatches.length > 0 || liveRaces.length > 0;

  return (
    <Screen>
      <Text style={typography.label} numberOfLines={1}>
        {league.name}
      </Text>
      <Text style={typography.title}>My Snooker</Text>
      <Text style={[typography.subtitle, styles.hint]}>
        Club tools, live games and logging. Also in the menu.
      </Text>

      {hasLive ? (
        <>
          <SectionTitle title="Live now" />
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
        </>
      ) : null}

      <View style={[styles.actions, hasLive && styles.actionsAfterLive]}>
        <Button
          label="Start a match"
          icon="play"
          onPress={() => router.push('/match/new')}
          disabled={!hasRoster}
        />
        <Button
          label="Log a race"
          icon="flag-outline"
          variant="secondary"
          onPress={() => router.push('/race/new')}
          disabled={!hasRoster}
        />
        {!hasRoster ? (
          <Text style={styles.ctaHint}>Add at least two players to log games.</Text>
        ) : null}
      </View>

      <SectionTitle title="Club tools" />
      <CommunityHubTiles
        tiles={[
          {
            label: 'Game history',
            hint: 'Matches & races',
            icon: 'time-outline',
            onPress: () => router.push('/(main)/history'),
          },
          {
            label: 'Champions',
            hint: 'Titles & race kings',
            icon: 'trophy-outline',
            onPress: () => router.push('/(main)/champions'),
          },
          {
            label: 'Stats',
            hint: 'Charts & form',
            icon: 'stats-chart-outline',
            onPress: () => router.push('/(main)/stats'),
          },
          {
            label: 'Leaderboard',
            hint: "Who's hot",
            icon: 'podium-outline',
            onPress: () => router.push('/(main)/leaderboard'),
          },
          {
            label: 'Players',
            hint: 'Roster & guests',
            icon: 'people-outline',
            onPress: () => router.push('/(main)/players'),
          },
          {
            label: 'League',
            hint: 'Invite · settings',
            icon: 'settings-outline',
            onPress: () => router.push('/(main)/league'),
          },
        ]}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hint: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    actions: {
      gap: spacing.sm,
    },
    actionsAfterLive: {
      marginTop: spacing.sm,
    },
    ctaHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
