import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface CommunityTile {
  label: string;
  hint: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

interface CommunityHubTilesProps {
  tiles: CommunityTile[];
}

export function CommunityHubTiles({ tiles }: CommunityHubTilesProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable
          key={tile.label}
          accessibilityRole="button"
          accessibilityLabel={`${tile.label}. ${tile.hint}`}
          onPress={tile.onPress}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        >
          <View style={styles.head}>
            {tile.icon ? <Ionicons name={tile.icon} size={18} color={palette.primary} /> : null}
            <Text style={styles.label} numberOfLines={1}>
              {tile.label}
            </Text>
          </View>
          <Text style={styles.hint} numberOfLines={2}>
            {tile.hint}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    tile: {
      flexBasis: '45%',
      flexGrow: 1,
      minWidth: 0,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
      minHeight: 76,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    label: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
    },
    hint: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
  });
