import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import { displayNameForUid } from '@/features/community/services/follow.service';
import { Screen } from '@/features/home/components/Screen';
import { colors, fonts, spacing, typography } from '@/theme/tokens';

export default function FollowsScreen(): ReactNode {
  const { uid, kind } = useLocalSearchParams<{ uid?: string; kind?: string }>();
  const graph = useFollowGraph(uid ?? null);
  const followingMode = kind === 'following';
  const rows = useMemo(
    () => (followingMode ? graph.following : graph.followers),
    [followingMode, graph.followers, graph.following],
  );

  return (
    <Screen>
      <Text style={typography.title}>{followingMode ? 'Following' : 'Followers'}</Text>
      {rows.length === 0 ? (
        <Text style={typography.subtitle}>
          {followingMode ? 'Not following anyone yet.' : 'No followers yet.'}
        </Text>
      ) : (
        rows.map((row) => {
          const otherUid = followingMode ? row.followingUid : row.followerUid;
          return (
            <Pressable
              key={row.id}
              style={styles.row}
              onPress={() => router.push(`/(main)/city-player?uid=${otherUid}`)}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {displayNameForUid(otherUid).trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.name}>{displayNameForUid(otherUid)}</Text>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 16,
  },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.chalk,
  },
});
