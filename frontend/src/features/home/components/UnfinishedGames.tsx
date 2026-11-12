import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiveSessionCards } from '@/features/home/components/LiveSessionCards';
import { sessionCount, type LiveSessionSet } from '@/features/home/hooks/use-live-sessions';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

interface UnfinishedGamesProps {
  sessions: LiveSessionSet;
  nameOf: (id: string) => string;
}

/**
 * Games left idle for 12+ hours, behind one collapsed row so they never crowd home.
 * Opening a game lets people carry on scoring or abandon it from its own options.
 */
export function UnfinishedGames({ sessions, nameOf }: UnfinishedGamesProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const [expanded, setExpanded] = useState(false);
  const count = sessionCount(sessions);
  if (count === 0) {
    return null;
  }
  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`Unfinished games, ${count}`}
        hitSlop={4}
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Ionicons name="time-outline" size={16} color={palette.textMuted} />
        <Text style={styles.label} numberOfLines={1}>
          Unfinished games <Text style={styles.count}>({count})</Text>
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={palette.textMuted}
        />
      </Pressable>
      {expanded ? <LiveSessionCards sessions={sessions} nameOf={nameOf} stale /> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: {
      marginBottom: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
    },
    pressed: {
      opacity: 0.7,
    },
    label: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.textMuted,
    },
    count: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
  });
