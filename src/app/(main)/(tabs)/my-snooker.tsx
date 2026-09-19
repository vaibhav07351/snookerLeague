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
import { colors, fonts, spacing, typography } from '@/theme/tokens';

export default function MySnookerScreen(): ReactNode {
  const { user, league } = useSession();
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

  return (
    <Screen>
      <Text style={typography.label}>{league.name}</Text>
      <Text style={typography.title}>My Snooker</Text>
      <Text style={styles.hint}>Club tools, live games, and logging — also in the menu.</Text>

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

      <View style={styles.ctaRow}>
        <Button
          label="Log match"
          onPress={() => router.push('/match/new')}
          style={styles.cta}
          disabled={!hasRoster}
        />
        <Button
          label="Log race"
          variant="secondary"
          onPress={() => router.push('/race/new')}
          style={styles.cta}
          disabled={!hasRoster}
        />
      </View>

      <CommunityHubTiles
        tiles={[
          {
            label: 'Game history',
            hint: 'Matches & races',
            onPress: () => router.push('/(main)/history'),
          },
          {
            label: 'Champions',
            hint: 'Titles & race kings',
            onPress: () => router.push('/(main)/champions'),
          },
          {
            label: 'Stats',
            hint: 'Charts & form',
            onPress: () => router.push('/(main)/stats'),
          },
          {
            label: 'Leaderboard',
            hint: "Who's hot",
            onPress: () => router.push('/(main)/leaderboard'),
          },
          {
            label: 'Players',
            hint: 'Roster & guests',
            onPress: () => router.push('/(main)/players'),
          },
          {
            label: 'League',
            hint: 'Invite · settings',
            onPress: () => router.push('/(main)/league'),
          },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cta: {
    flex: 1,
  },
});
