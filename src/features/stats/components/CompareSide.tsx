import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PlayerCard } from '@/features/stats/hooks/use-player-card';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, type Palette } from '@/theme/tokens';

interface CompareSideProps {
  card: PlayerCard;
  /** Side colour, matching the bars below. */
  color: string;
  align: 'left' | 'right';
  onPress: () => void;
}

/** One player's name (tap to change) and rating at the top of Compare. */
export function CompareSide({ card, color, align, onPress }: CompareSideProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const right = align === 'right';
  const name = card.insights.player.displayName;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. Change player`}
      onPress={onPress}
      style={({ pressed }) => [styles.side, right && styles.sideRight, pressed && styles.pressed]}
    >
      <View style={[styles.nameRow, right && styles.nameRowRight]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Ionicons name="chevron-down" size={14} color={palette.textMuted} />
      </View>
      <Text style={[styles.rating, { color }]}>{card.rating.rating}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {card.rating.provisional
          ? 'Provisional'
          : card.rank != null
            ? `#${card.rank} of ${card.rankedCount}`
            : 'Unranked'}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    side: {
      flex: 1,
      minWidth: 0,
      alignItems: 'flex-start',
      gap: 1,
    },
    sideRight: {
      alignItems: 'flex-end',
    },
    pressed: {
      opacity: 0.75,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
    },
    nameRowRight: {
      flexDirection: 'row-reverse',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    name: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    rating: {
      fontFamily: fonts.display,
      fontSize: 24,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: c.textMuted,
    },
  });
