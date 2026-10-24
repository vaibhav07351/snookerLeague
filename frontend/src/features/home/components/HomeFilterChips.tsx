import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { HomeFilter } from '@/features/home/services/home-feed.service';
import { Chip } from '@/shared/ui/Chip';
import { spacing } from '@/theme/tokens';

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
      {FILTERS.map((chip) => (
        <Chip
          key={chip.id}
          label={chip.label}
          selected={chip.id === value}
          onPress={() => onChange(chip.id)}
        />
      ))}
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
});
