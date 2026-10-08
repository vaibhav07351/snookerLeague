import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MovementBadge } from '@/features/stats/components/MovementBadge';
import type { BoardRow } from '@/features/stats/services/leaderboard.service';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface PodiumProps {
  /** The top three (or fewer) ranked rows, in rank order. */
  rows: BoardRow[];
  meId: string | null;
  selectedIds: string[];
  selecting: boolean;
  dense: boolean;
  onPress: (row: BoardRow) => void;
}

/** Top three, with first place raised in the middle. */
export function Podium({
  rows,
  meId,
  selectedIds,
  selecting,
  dense,
  onPress,
}: PodiumProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  // Display order: 2nd, 1st, 3rd.
  const slots = [rows[1], rows[0], rows[2]];
  const steps = dense ? [14, 26, 6] : [20, 36, 10];

  return (
    <View style={styles.wrap}>
      {slots.map((row, i) => {
        if (!row) {
          return <View key={`empty-${i}`} style={styles.slot} />;
        }
        const first = row.rank === 1;
        const selected = selectedIds.includes(row.playerId);
        return (
          <Pressable
            key={row.playerId}
            accessibilityRole="button"
            accessibilityState={selecting ? { checked: selected } : undefined}
            accessibilityLabel={`Rank ${row.rank}, ${row.name}, ${row.value}`}
            onPress={() => onPress(row)}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
          >
            <View style={[styles.avatar, first && styles.avatarFirst]}>
              {selecting && selected ? (
                <Ionicons name="checkmark" size={20} color={palette.onPrimary} />
              ) : (
                <Text style={styles.avatarText}>{row.name.trim().charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <Text style={[styles.name, row.playerId === meId && styles.nameMe]} numberOfLines={1}>
              {row.name}
            </Text>
            <View style={styles.valueRow}>
              <Text style={styles.value}>{row.value}</Text>
              <MovementBadge movement={row.movement} isNew={row.isNew} />
            </View>
            <View
              style={[
                styles.step,
                first && styles.stepFirst,
                selected && styles.stepSelected,
                { height: steps[i] },
              ]}
            >
              <Text style={[styles.stepText, first && styles.stepTextFirst]}>{row.rank}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    slot: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      gap: 2,
    },
    pressed: {
      opacity: 0.8,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.cardRaised,
      borderWidth: 2,
      borderColor: c.border,
    },
    avatarFirst: {
      backgroundColor: c.primary,
      borderColor: c.primarySoft,
    },
    avatarText: {
      fontFamily: fonts.display,
      fontSize: 17,
      color: c.text,
    },
    name: {
      maxWidth: '100%',
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.text,
    },
    nameMe: {
      color: c.primary,
    },
    valueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    value: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.textMuted,
    },
    step: {
      alignSelf: 'stretch',
      marginTop: 2,
      borderTopLeftRadius: radii.xs,
      borderTopRightRadius: radii.xs,
      backgroundColor: c.cardRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepFirst: {
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.borderStrong,
    },
    stepSelected: {
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: c.primary,
    },
    stepText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.textMuted,
    },
    stepTextFirst: {
      color: c.primary,
    },
  });
