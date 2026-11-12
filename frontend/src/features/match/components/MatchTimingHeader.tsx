import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useLiveElapsed } from '@/shared/hooks/use-live-elapsed';
import { formatDuration } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface MatchTimingHeaderProps {
  enabled: boolean;
  /** When the frame clock started (ISO), or null while waiting for the first shot. */
  startedAt: string | null;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

/**
 * Frame clock in the header. Tap to turn timing on or off. It ticks by itself, so the match
 * screen never re-renders once a second.
 */
export function MatchTimingHeader({
  enabled,
  startedAt,
  disabled,
  onToggle,
}: MatchTimingHeaderProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const pending = startedAt === null;
  const elapsedSeconds = useLiveElapsed(startedAt, enabled && !pending);
  const label = !enabled ? 'Timer off' : pending ? '0:00' : formatDuration(elapsedSeconds);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled }}
      accessibilityLabel={
        enabled
          ? pending
            ? 'Frame timer on, starts with the first shot. Tap to turn off'
            : `Frame time ${label}. Tap to turn the timer off`
          : 'Frame timer off. Tap to turn on'
      }
      disabled={disabled}
      onPress={() => onToggle(!enabled)}
      hitSlop={6}
      style={[styles.pill, enabled && !pending && styles.pillOn, disabled && styles.disabled]}
    >
      <Ionicons
        name="timer-outline"
        size={16}
        color={enabled && !pending ? palette.primary : palette.textMuted}
      />
      <Text style={[styles.label, enabled && !pending && styles.labelOn]}>{label}</Text>
    </Pressable>
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
    disabled: {
      opacity: 0.5,
    },
  });
