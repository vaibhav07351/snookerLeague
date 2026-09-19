import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HomeActivity } from '@/features/home/services/home-feed.service';
import { colors, fonts, spacing, typography } from '@/theme/tokens';

interface HomeActivityListProps {
  items: HomeActivity[];
  empty: string;
}

export function HomeActivityList({ items, empty }: HomeActivityListProps): ReactNode {
  if (items.length === 0) {
    return <Text style={typography.subtitle}>{empty}</Text>;
  }
  return (
    <View>
      {items.map((item) => {
        const body = (
          <>
            <Text style={styles.feedTitle}>{item.title}</Text>
            <Text style={styles.feedBody}>{item.body}</Text>
          </>
        );
        if (!item.href) {
          return (
            <View key={item.id} style={styles.feedItem}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={item.id}
            style={styles.feedItem}
            onPress={() => router.push(item.href as Href)}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  feedItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  feedTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
  },
  feedBody: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
  },
});
