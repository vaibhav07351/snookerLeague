import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { HomeFilter } from '@/features/home/services/home-feed.service';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const FILTERS: Array<{ id: HomeFilter; label: string }> = [
  { id: 'your', label: 'Your' },
  { id: 'played', label: 'Played' },
  { id: 'network', label: 'Network' },
  { id: 'all', label: 'All' },
];

interface HomeFilterChipsProps {
  value: HomeFilter;
  onChange: (next: HomeFilter) => void;
}

export function HomeFilterChips({ value, onChange }: HomeFilterChipsProps): ReactNode {
  return (
    <View style={styles.row}>
      {FILTERS.map((chip) => {
        const on = chip.id === value;
        return (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(chip.id)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.surfaceBright,
    borderColor: colors.borderStrong,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.chalkMuted,
  },
  labelOn: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
  },
});
