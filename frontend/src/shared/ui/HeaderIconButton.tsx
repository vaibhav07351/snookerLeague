import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { usePalette } from '@/theme/ThemeProvider';
import { TOUCH_TARGET } from '@/theme/tokens';

interface HeaderIconButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Read by screen readers, e.g. "New post". */
  label: string;
  onPress: () => void;
}

/** An icon button for the right of a screen header ("+", "..."), at full touch size. */
export function HeaderIconButton({ icon, label, onPress }: HeaderIconButtonProps): ReactNode {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color={palette.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
