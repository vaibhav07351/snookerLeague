import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

export interface CommunityTile {
  label: string;
  hint: string;
  onPress: () => void;
}

interface CommunityHubTilesProps {
  tiles: CommunityTile[];
}

export function CommunityHubTiles({ tiles }: CommunityHubTilesProps): ReactNode {
  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <Pressable key={tile.label} onPress={tile.onPress} style={styles.tile}>
          <Text style={styles.label}>{tile.label}</Text>
          <Text style={styles.hint}>{tile.hint}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tile: {
    width: '48%',
    flexGrow: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    minHeight: 72,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 15,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
  },
});
