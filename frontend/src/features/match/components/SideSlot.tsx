import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface SideSlotProps {
  side: 'a' | 'b';
  ids: string[];
  perSide: number;
  nameOf: (id: string) => string;
  /** Tapping a seated player takes them off the side. */
  onRemove: (id: string) => void;
}

/** One side of a new match: its seated players, and "Tap a player" for each empty seat. */
export function SideSlot({ side, ids, perSide, nameOf, onRemove }: SideSlotProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const tone = sideColor(palette, side);
  return (
    <View style={[styles.slot, { borderColor: tone }]}>
      <Text style={[styles.title, { color: tone }]}>Side {side.toUpperCase()}</Text>
      {Array.from({ length: perSide }, (_, i) => {
        const id = ids[i];
        return id ? (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${nameOf(id)} from side ${side.toUpperCase()}`}
            onPress={() => onRemove(id)}
            hitSlop={4}
          >
            <Text style={styles.name} numberOfLines={1}>
              {nameOf(id)}
            </Text>
          </Pressable>
        ) : (
          <Text key={`empty-${i}`} style={styles.empty}>
            Tap a player
          </Text>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    slot: {
      flex: 1,
      minWidth: 0,
      minHeight: 84,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      gap: 4,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    name: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.bodyLarge,
      color: c.text,
      minHeight: 24,
    },
    empty: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textFaint,
      minHeight: 24,
    },
  });
