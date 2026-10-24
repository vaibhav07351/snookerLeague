import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormPips } from '@/features/stats/components/FormPips';
import { PROVISIONAL_GAMES, type RatingEntry } from '@/features/stats/services/rating.service';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface PlayerHeroProps {
  name: string;
  subtitle?: string | null;
  rating: RatingEntry;
  rank: number | null;
  rankedCount: number;
  /** Makes the name a picker (shows a chevron). */
  onNamePress?: () => void;
  /** Action on the right, e.g. a settings or compare button. */
  right?: ReactNode;
  /** Smaller avatar and type on short screens. */
  dense?: boolean;
}

/** Who this is, their rating and rank, and recent form, in one compact strip. */
export function PlayerHero({
  name,
  subtitle,
  rating,
  rank,
  rankedCount,
  onNamePress,
  right,
  dense = false,
}: PlayerHeroProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const avatarSize = dense ? 44 : 54;
  const standing = rating.provisional
    ? `Provisional · ${PROVISIONAL_GAMES - rating.games} more to rank`
    : rank != null
      ? `#${rank} of ${rankedCount}`
      : 'Unranked';

  const nameRow = (
    <View style={styles.nameRow}>
      <Text style={[styles.name, dense && styles.nameDense]} numberOfLines={1}>
        {name}
      </Text>
      {onNamePress ? <Ionicons name="chevron-down" size={18} color={palette.textMuted} /> : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.avatar,
          { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: avatarSize * 0.42 }]}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.mid}>
        {onNamePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}. Change player`}
            onPress={onNamePress}
            hitSlop={6}
          >
            {nameRow}
          </Pressable>
        ) : (
          nameRow
        )}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.strip}>
          <View style={styles.ratingPill}>
            <Text style={styles.ratingValue}>{rating.rating}</Text>
            <Text style={styles.ratingLabel}>RATING</Text>
          </View>
          <Text style={styles.standing} numberOfLines={1}>
            {standing}
          </Text>
          <FormPips form={rating.form} />
        </View>
      </View>
      {right}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
    },
    avatar: {
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.primarySoft,
    },
    avatarText: {
      fontFamily: fonts.display,
      color: c.onPrimary,
    },
    mid: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    name: {
      flexShrink: 1,
      fontFamily: fonts.display,
      fontSize: 21,
      color: c.text,
    },
    nameDense: {
      fontSize: 18,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: 2,
    },
    ratingPill: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    ratingValue: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.primary,
    },
    ratingLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 9,
      letterSpacing: 0.8,
      color: c.textMuted,
    },
    standing: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: c.text,
    },
  });
