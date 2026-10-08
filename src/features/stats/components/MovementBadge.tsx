import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

interface MovementBadgeProps {
  /** Places gained (+) or lost (-) this week; null when unknown. */
  movement: number | null;
  isNew: boolean;
}

/** Up / down arrow with places moved, or NEW for a first-time entry. Empty when unchanged. */
export function MovementBadge({ movement, isNew }: MovementBadgeProps): ReactNode {
  const palette = usePalette();
  if (isNew) {
    return <Text style={[styles.text, { color: palette.info }]}>NEW</Text>;
  }
  if (movement == null || movement === 0) {
    return null;
  }
  const up = movement > 0;
  const color = up ? palette.success : palette.danger;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(movement)} this week`}
    >
      <Ionicons name={up ? 'caret-up' : 'caret-down'} size={11} color={color} />
      <Text style={[styles.text, { color }]}>{Math.abs(movement)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
});
