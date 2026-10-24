import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { toUserMessage } from '@/shared/errors/app-error';
import type { League } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface LeagueSwitchListProps {
  /** Called after a successful switch; the caller decides where to go next. */
  onSwitched: () => void;
}

/** The user's leagues; tapping one makes it the active league. */
export function LeagueSwitchList({ onSwitched }: LeagueSwitchListProps): ReactNode {
  const styles = useStyles(makeStyles);
  const { league, leagues, switchLeague } = useSession();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  async function onSwitch(target: League): Promise<void> {
    if (!league || target.id === league.id) {
      return;
    }
    setSwitchingId(target.id);
    try {
      await switchLeague(target.id);
      onSwitched();
    } catch (error) {
      notify.error('Could not switch league', toUserMessage(error));
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <View style={styles.list}>
      {leagues.map((l) => {
        const active = l.id === league?.id;
        return (
          <Pressable
            key={l.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => void onSwitch(l)}
            disabled={switchingId != null}
            style={({ pressed }) => [styles.row, active && styles.rowOn, pressed && styles.pressed]}
          >
            <View style={styles.copy}>
              <Text style={[styles.name, active && styles.nameOn]} numberOfLines={1}>
                {l.name}
              </Text>
              <Text style={styles.meta}>
                {active ? 'Active now' : switchingId === l.id ? 'Switching...' : 'Tap to switch'}
              </Text>
            </View>
            {active ? <Text style={styles.badge}>ON</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    pressed: {
      opacity: 0.85,
    },
    copy: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    nameOn: {
      color: c.primary,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    badge: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.onPrimary,
      backgroundColor: c.primary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
  });
