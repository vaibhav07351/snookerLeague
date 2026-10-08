import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HomeActivity } from '@/features/home/services/home-feed.service';
import { EmptyState } from '@/shared/ui/EmptyState';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface HomeActivityListProps {
  items: HomeActivity[];
  empty: string;
}

export function HomeActivityList({ items, empty }: HomeActivityListProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  if (items.length === 0) {
    return <EmptyState icon="newspaper-outline" title="Nothing here yet" message={empty} />;
  }
  return (
    <View style={styles.list}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const body = (
          <View style={styles.copy}>
            <Text style={styles.feedTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.feedBody} numberOfLines={3}>
              {item.body}
            </Text>
          </View>
        );
        if (!item.href) {
          return (
            <View key={item.id} style={[styles.feedItem, isLast && styles.last]}>
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.feedItem,
              isLast && styles.last,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(item.href as Href)}
          >
            {body}
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      backgroundColor: c.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    feedItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: TOUCH_TARGET,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    last: {
      borderBottomWidth: 0,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    feedTitle: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
      lineHeight: 20,
    },
    feedBody: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
  });
