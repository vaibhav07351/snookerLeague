import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlayerProfile } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, typeScale, type Palette } from '@/theme/tokens';

/** One player on the city list: name, win rate, games and best break. Opens their page. */
export function CityPlayerRow({ profile: p }: { profile: PlayerProfile }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => router.push(`/(main)/city-player?uid=${p.uid}`)}
    >
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {p.displayName}
        </Text>
        <Text style={styles.meta}>
          {p.winPct}% · {p.played} played · HB {p.highestBreak || '-'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: TOUCH_TARGET,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      backgroundColor: c.card,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    name: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.lead,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.small,
      lineHeight: 18,
    },
  });
