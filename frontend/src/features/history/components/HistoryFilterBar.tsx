import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  HISTORY_FORMAT_LABEL,
  HISTORY_FORMATS,
  type HistoryFilter,
} from '@/features/history/services/history.service';
import type { Player } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Chip } from '@/shared/ui/Chip';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, typeScale, type Palette } from '@/theme/tokens';

interface HistoryFilterBarProps {
  filter: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
  players: Player[];
  nameOf: (playerId: string) => string;
}

/** Two pills, format and player; each opens a sheet of choices. */
export function HistoryFilterBar({
  filter,
  onChange,
  players,
  nameOf,
}: HistoryFilterBarProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState<'format' | 'player' | null>(null);
  const close = (): void => setOpen(null);
  const pick = (next: HistoryFilter): void => {
    onChange(next);
    close();
  };
  const sorted = [...players].sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <>
      <View style={styles.bar}>
        <FilterPill
          label={HISTORY_FORMAT_LABEL[filter.format]}
          active={filter.format !== 'all'}
          a11y="Filter by format"
          onPress={() => setOpen('format')}
        />
        <FilterPill
          label={filter.playerId ? nameOf(filter.playerId) : 'Everyone'}
          active={filter.playerId !== null}
          a11y="Filter by player"
          onPress={() => setOpen('player')}
        />
      </View>

      <BottomSheet visible={open === 'format'} title="Show" onClose={close}>
        <View style={styles.chips}>
          {HISTORY_FORMATS.map((f) => (
            <Chip
              key={f}
              label={HISTORY_FORMAT_LABEL[f]}
              selected={filter.format === f}
              onPress={() => pick({ ...filter, format: f })}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={open === 'player'} title="Games with" onClose={close}>
        <View style={styles.chips}>
          <Chip
            label="Everyone"
            selected={filter.playerId === null}
            onPress={() => pick({ ...filter, playerId: null })}
          />
          {sorted.map((p) => (
            <Chip
              key={p.id}
              label={p.displayName}
              selected={filter.playerId === p.id}
              onPress={() => pick({ ...filter, playerId: p.id })}
            />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function FilterPill(props: {
  label: string;
  active: boolean;
  a11y: string;
  onPress: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.a11y}: ${props.label}`}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.pill,
        props.active && styles.pillOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillText, props.active && styles.pillTextOn]} numberOfLines={1}>
        {props.label}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={props.active ? palette.onPrimary : palette.textMuted}
      />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    pill: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    pillOn: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    pressed: {
      opacity: 0.85,
    },
    pillText: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.body,
      color: c.text,
    },
    pillTextOn: {
      color: c.onPrimary,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
  });
