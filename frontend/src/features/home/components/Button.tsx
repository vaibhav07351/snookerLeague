import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Smaller button for inline actions and dense rows. */
  size?: 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  style,
  disabled,
  ...rest
}: ButtonProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const isDisabled = disabled || loading;
  const labelColor =
    variant === 'primary'
      ? palette.onPrimary
      : variant === 'danger'
        ? palette.danger
        : variant === 'ghost'
          ? palette.textMuted
          : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.small,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={labelColor} /> : null}
          <Text
            style={[styles.label, size === 'sm' && styles.smallLabel, { color: labelColor }]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    base: {
      minHeight: 50,
      paddingVertical: 12,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    small: {
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    primary: {
      backgroundColor: c.primary,
    },
    secondary: {
      backgroundColor: c.cardRaised,
      borderWidth: 1,
      borderColor: c.border,
    },
    danger: {
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    pressed: {
      transform: [{ scale: 0.98 }],
      opacity: 0.9,
    },
    disabled: {
      opacity: 0.4,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      textAlign: 'center',
    },
    smallLabel: {
      fontSize: 14,
    },
  });
