import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { TOUCH_TARGET, fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface GroupFrameEndRowProps {
  /** Players sharing the top score. */
  leaders: string[];
  /** False until anyone has a point: an empty frame cannot be ended. */
  hasScore: boolean;
  disabled: boolean;
  nameOf: (playerId: string) => string;
  onEndFrame: (winnerId: string) => void;
}

/**
 * Ends the frame for the top scorer. When the top is tied (a re-spotted black in real play),
 * the scorer picks which of the tied players took it.
 */
export function GroupFrameEndRow({
  leaders,
  hasScore,
  disabled,
  nameOf,
  onEndFrame,
}: GroupFrameEndRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const only = leaders.length === 1 ? leaders[0] : undefined;

  if (!hasScore) {
    return (
      <View style={[styles.button, styles.idle]}>
        <Text style={styles.kicker}>End frame</Text>
        <Text style={styles.idleText}>Score a ball first</Text>
      </View>
    );
  }

  if (only) {
    return (
      <Pressable
        onPress={() => onEndFrame(only)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`End frame, ${nameOf(only)} wins it`}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.kicker}>End frame</Text>
        <Text style={styles.winner} numberOfLines={1}>
          {nameOf(only)} wins it
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.tieWrap}>
      <Text style={[styles.kicker, { color: palette.warning }]}>Tied at the top: who took it?</Text>
      <View style={styles.tieRow}>
        {leaders.map((id) => (
          <Pressable
            key={id}
            onPress={() => onEndFrame(id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`End frame, ${nameOf(id)} wins it`}
            style={({ pressed }) => [styles.button, styles.tieButton, pressed && styles.pressed]}
          >
            <Text style={styles.winner} numberOfLines={1}>
              {nameOf(id)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    button: {
      minHeight: TOUCH_TARGET + 8,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    idle: {
      borderColor: c.border,
      borderStyle: 'dashed',
    },
    idleText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.body,
      color: c.textFaint,
    },
    pressed: {
      opacity: 0.75,
    },
    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.micro,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    winner: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.bodyLarge,
      color: c.primary,
    },
    tieWrap: {
      gap: spacing.xs,
    },
    tieRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tieButton: {
      flexGrow: 1,
      flexBasis: '30%',
    },
  });
