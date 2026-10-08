import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import { PlayerDashboard } from '@/features/stats/components/PlayerDashboard';
import { useLeagueStats } from '@/features/stats/hooks/use-league-stats';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LoadingState } from '@/shared/ui/LoadingState';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export function PlayerDetailScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, user } = useSession();
  const stats = useLeagueStats(league?.id, user?.uid);

  if (!stats.ready) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading player" />
      </Screen>
    );
  }

  const player = id ? stats.playerById.get(id) : undefined;
  if (!player) {
    return (
      <Screen>
        <EmptyState
          icon="person-outline"
          title="Player not found"
          message="They may have been removed from this club."
          actionLabel="All players"
          onAction={() => router.replace('/(main)/players')}
        />
      </Screen>
    );
  }

  const isMe = player.id === stats.meId;
  const compareHref =
    stats.meId && !isMe
      ? `/(main)/compare?a=${stats.meId}&b=${player.id}`
      : `/(main)/compare?a=${player.id}`;

  return (
    <Screen scroll={false}>
      <PlayerDashboard
        stats={stats}
        playerId={player.id}
        tabs={['overview', 'breaks', 'pace', 'rivals']}
        subtitle={isMe ? 'You' : player.kind === 'guest' ? 'Guest player' : 'League member'}
        heroRight={
          stats.players.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isMe ? 'Compare with someone' : 'Compare with me'}
              onPress={() => router.push(compareHref)}
              style={({ pressed }) => [styles.compare, pressed && styles.pressed]}
            >
              <Ionicons name="git-compare-outline" size={18} color={palette.primary} />
              <Text style={styles.compareText}>{isMe ? 'Compare' : 'Vs me'}</Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    compare: {
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 2,
      borderRadius: radii.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    pressed: {
      opacity: 0.75,
    },
    compareText: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.primary,
    },
  });
