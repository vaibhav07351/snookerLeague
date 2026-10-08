import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import { displayNameForUid } from '@/features/community/services/follow.service';
import { Screen } from '@/features/home/components/Screen';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

export default function FollowsScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { uid, kind } = useLocalSearchParams<{ uid?: string; kind?: string }>();
  const graph = useFollowGraph(uid ?? null);
  const followingMode = kind === 'following';
  const rows = useMemo(
    () => (followingMode ? graph.following : graph.followers),
    [followingMode, graph.followers, graph.following],
  );

  return (
    <Screen>
      <Text style={[typography.title, styles.heading]}>
        {followingMode ? 'Following' : 'Followers'}
      </Text>
      {rows.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={followingMode ? 'Not following anyone yet' : 'No followers yet'}
          message="Follow players from the city leaderboard to keep up with their games."
        />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => {
            const otherUid = followingMode ? row.followingUid : row.followerUid;
            const name = displayNameForUid(otherUid);
            return (
              <Card
                key={row.id}
                style={styles.row}
                accessibilityLabel={`Open ${name}`}
                onPress={() => router.push(`/(main)/city-player?uid=${otherUid}`)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    heading: {
      marginBottom: spacing.md,
    },
    list: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 16,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
  });
