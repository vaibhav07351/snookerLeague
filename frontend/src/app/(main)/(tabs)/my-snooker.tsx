import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { CommunityHubTiles } from '@/features/community/components/CommunityHubTiles';
import { Screen } from '@/shared/ui/Screen';
import { useStyles } from '@/theme/ThemeProvider';
import { makeTypography } from '@/theme/tokens';

/** Club tools launcher. Starting games and live games live on Home, so this stays one grid. */
export default function MySnookerScreen(): ReactNode {
  const { user, league } = useSession();
  const typography = useStyles(makeTypography);

  if (!user || !league) {
    return null;
  }

  return (
    <Screen>
      <Text style={[typography.label, styles.league]} numberOfLines={1}>
        {league.name}
      </Text>
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
            label: 'Head to head',
            hint: 'Compare two players',
            icon: 'git-compare-outline',
            onPress: () => router.push('/(main)/compare'),
          },
          {
            label: 'Tournaments',
            hint: 'Knockouts & round robins',
            icon: 'git-network-outline',
            onPress: () => router.push('/(main)/tournaments'),
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

const styles = StyleSheet.create({
  league: {
    textAlign: 'center',
  },
});
