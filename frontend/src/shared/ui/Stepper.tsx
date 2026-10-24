import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
}

/** Labelled number control with - / + buttons (no keyboard needed). */
export function Stepper({ label, value, min, max, onChange, step = 1 }: StepperProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const dec = Math.max(min, value - step);
  const inc = Math.min(max, value + step);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          disabled={value <= min}
          onPress={() => onChange(dec)}
          style={[styles.btn, value <= min && styles.disabled]}
        >
          <Ionicons name="remove" size={18} color={palette.text} />
        </Pressable>
        <Text style={styles.value} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          disabled={value >= max}
          onPress={() => onChange(inc)}
          style={[styles.btn, value >= max && styles.disabled]}
        >
          <Ionicons name="add" size={18} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    btn: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    value: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fonts.bodyBold,
      fontSize: 18,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    disabled: {
      opacity: 0.3,
    },
  });
