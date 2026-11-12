import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { Player } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface PlayerPickGridProps {
  players: Player[];
  sideA: string[];
  sideB: string[];
  /** Free-for-all: players in playing order (numbered chips). */
  group: string[];
  freeForAll: boolean;
  onToggle: (playerId: string) => void;
  /** Shows the "+ Guest" chip at the end. */
  onAddGuest: (() => void) | null;
  /** Fill the height left on the screen and scroll inside; false lets the page scroll. */
  boxed: boolean;
}

/** League players as chips to tap into a side (or the playing order), plus "+ Guest". */
export function PlayerPickGrid({
  players,
  sideA,
  sideB,
  group,
  freeForAll,
  onToggle,
  onAddGuest,
  boxed,
}: PlayerPickGridProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <ScrollView
      style={boxed ? styles.box : undefined}
      contentContainerStyle={styles.grid}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={boxed}
    >
      {players.map((p) => {
        const seat = freeForAll ? group.indexOf(p.id) : -1;
        const inGroup = seat >= 0;
        const inA = !freeForAll && sideA.includes(p.id);
        const inB = !freeForAll && sideB.includes(p.id);
        const tag = inGroup ? `${seat + 1} · ` : inA ? 'A · ' : inB ? 'B · ' : '';
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: inA || inB || inGroup }}
            onPress={() => onToggle(p.id)}
            hitSlop={2}
            style={[
              styles.player,
              inA && { borderColor: palette.teamA, backgroundColor: palette.teamASoft },
              inB && { borderColor: palette.teamB, backgroundColor: palette.teamBSoft },
              inGroup && { borderColor: palette.primary, backgroundColor: palette.cardHighlight },
            ]}
          >
            <Text
              style={[
                styles.playerText,
                inA && { color: palette.teamA },
                inB && { color: palette.teamB },
                inGroup && { color: palette.primary },
              ]}
              numberOfLines={1}
            >
              {tag}
              {p.displayName}
            </Text>
          </Pressable>
        );
      })}
      {onAddGuest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a guest player"
          onPress={onAddGuest}
          hitSlop={2}
          style={[styles.player, styles.addGuest]}
        >
          <Ionicons name="add" size={16} color={palette.textMuted} />
          <Text style={styles.addGuestText}>Guest</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    // Takes the height left over, so the page itself never scrolls.
    box: {
      flex: 1,
      minHeight: 0,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    player: {
      maxWidth: '100%',
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    playerText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.body,
      color: c.text,
    },
    addGuest: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderStyle: 'dashed',
      backgroundColor: 'transparent',
    },
    addGuestText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.body,
      color: c.textMuted,
    },
  });
