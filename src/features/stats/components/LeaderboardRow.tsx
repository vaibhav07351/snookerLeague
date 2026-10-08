import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormPips } from '@/features/stats/components/FormPips';
import { MovementBadge } from '@/features/stats/components/MovementBadge';
import type { FormResult } from '@/features/stats/services/rating.service';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface LeaderboardRowProps {
  /** Null while still qualifying. */
  rank: number | null;
  name: string;
  sub: string;
  value: string;
  movement?: number | null;
  isNew?: boolean;
  form?: FormResult[];
  /** The signed-in player's own row. */
  isMe?: boolean;
  /** Compare mode: show a tick box. */
  selecting?: boolean;
  selected?: boolean;
  /** Hide the form pips on narrow phones. */
  compact?: boolean;
  onPress?: () => void;
}

/** One ranked line: rank, name, a one-line summary, the headline value and its trend. */
export function LeaderboardRow({
  rank,
  name,
  sub,
  value,
  movement = null,
  isNew = false,
  form,
  isMe = false,
  selecting = false,
  selected = false,
  compact = false,
  onPress,
}: LeaderboardRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selecting ? { checked: selected } : undefined}
      accessibilityLabel={`${rank != null ? `Rank ${rank}, ` : ''}${name}, ${value}, ${sub}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isMe && styles.me,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {selecting ? (
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={selected ? palette.primary : palette.textMuted}
        />
      ) : (
        <View style={[styles.rank, rank != null && rank <= 3 && styles.rankPodium]}>
          {rank != null ? (
            <Text style={[styles.rankText, rank <= 3 && styles.rankTextPodium]}>{rank}</Text>
          ) : (
            <Ionicons name="hourglass-outline" size={14} color={palette.textMuted} />
          )}
        </View>
      )}
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
          {isMe ? <Text style={styles.you}> · you</Text> : null}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {form && !compact ? <FormPips form={form} max={5} size={7} /> : null}
      <View style={styles.right}>
        <Text style={[styles.value, rank == null && styles.valueMuted]} numberOfLines={1}>
          {value}
        </Text>
        <MovementBadge movement={movement} isNew={isNew} />
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radii.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    me: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    selected: {
      borderColor: c.primary,
    },
    pressed: {
      opacity: 0.85,
    },
    rank: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.cardRaised,
    },
    rankPodium: {
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    rankText: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 14,
    },
    rankTextPodium: {
      color: c.primary,
    },
    mid: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
    },
    you: {
      fontFamily: fonts.bodyMedium,
      color: c.primary,
      fontSize: 12,
    },
    sub: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
    },
    right: {
      alignItems: 'flex-end',
      minWidth: 44,
    },
    value: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    valueMuted: {
      color: c.textMuted,
    },
  });
