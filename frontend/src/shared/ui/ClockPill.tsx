import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLiveElapsed } from '@/shared/hooks/use-live-elapsed';
import { formatDuration } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface ClockPillProps {
  /** When the clock started (ISO), or null while waiting for the first shot. */
  startedAt: string | null;
  /** False once the game is over: the clock stops ticking. */
  running: boolean;
  /** What is being timed, for screen readers, e.g. "Frame time" or "Race time". */
  label: string;
}

/**
 * Read-only live clock for the screen header. Looks the same as the match frame timer
 * (`MatchTimingHeader`), which adds an on/off switch on top of it. It ticks by itself, so the
 * screen around it never re-renders once a second.
 */
export function ClockPill({ startedAt, running, label }: ClockPillProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const pending = startedAt === null;
  const seconds = useLiveElapsed(startedAt, running);
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
