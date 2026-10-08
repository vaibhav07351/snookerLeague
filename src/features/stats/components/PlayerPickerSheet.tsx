import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ratingOf, type RatingTable } from '@/features/stats/services/rating.service';
import type { Player } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface PlayerPickerSheetProps {
  visible: boolean;
  title: string;
  players: Player[];
  ratings: RatingTable;
  selectedId: string | null;
  /** Greyed out and not selectable (e.g. the other side of a comparison). */
  disabledId?: string | null;
  meId?: string | null;
  onSelect: (playerId: string) => void;
  onClose: () => void;
}

/** Choose a league player, showing each one's rating. */
export function PlayerPickerSheet({
  visible,
  title,
  players,
  ratings,
  selectedId,
  disabledId,
  meId,
  onSelect,
  onClose,
}: PlayerPickerSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      {players.map((p) => {
        const on = p.id === selectedId;
        const disabled = p.id === disabledId;
        const entry = ratingOf(ratings, p.id);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => {
              onSelect(p.id);
              onClose();
            }}
            style={({ pressed }) => [
              styles.row,
              on && styles.rowOn,
              disabled && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.mid}>
              <Text style={styles.name} numberOfLines={1}>
                {p.displayName}
                {p.id === meId ? <Text style={styles.you}> · you</Text> : null}
              </Text>
              <Text style={styles.meta}>
                {entry.provisional ? 'Provisional' : 'Rating'} {entry.rating} · {entry.games}{' '}
                results
              </Text>
            </View>
            {on ? <Ionicons name="checkmark" size={20} color={palette.primary} /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      minHeight: TOUCH_TARGET + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    disabled: {
      opacity: 0.4,
    },
    pressed: {
      opacity: 0.8,
    },
    mid: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    you: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: c.primary,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
  });
