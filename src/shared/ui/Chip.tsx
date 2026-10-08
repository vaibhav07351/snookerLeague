import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, type Palette } from '@/theme/tokens';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

/** Selectable pill for filters and pickers. */
export function Chip({ label, selected = false, onPress, disabled }: ChipProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.on,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.text, selected && styles.textOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    chip: {
      minHeight: 40,
      maxWidth: '100%',
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    on: {
      backgroundColor: c.cardHighlight,
      borderColor: c.primary,
    },
    pressed: {
      opacity: 0.8,
    },
    disabled: {
      opacity: 0.4,
    },
    text: {
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: 13,
    },
    textOn: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
    },
  });
