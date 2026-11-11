import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface ClockPillProps {
  /** Seconds on the clock so far. */
  seconds: number;
  /** True while waiting for the first shot (the clock starts on it). */
  pending: boolean;
  /** What is being timed, for screen readers, e.g. "Frame time" or "Race time". */
  label: string;
}

/**
 * Read-only live clock for the screen header. Looks the same as the match frame timer
 * (`MatchTimingHeader`), which adds an on/off switch on top of it.
 */
export function ClockPill({ seconds, pending, label }: ClockPillProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const text = pending ? '0:00' : formatDuration(seconds);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={pending ? `${label}, starts with the first shot` : `${label} ${text}`}
      style={[styles.pill, !pending && styles.pillOn]}
    >
      <Ionicons
        name="timer-outline"
        size={16}
        color={pending ? palette.textMuted : palette.primary}
      />
      <Text style={[styles.label, !pending && styles.labelOn]}>{text}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 34,
      paddingHorizontal: 10,
      marginRight: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    pillOn: {
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
    },
    label: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 13,
      minWidth: 36,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    labelOn: {
      color: c.primary,
    },
  });
