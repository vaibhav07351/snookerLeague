import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  style,
  disabled,
  ...rest
}: ButtonProps): ReactNode {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.felt : colors.chalk} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'secondary' && styles.secondaryLabel,
            variant === 'ghost' && styles.ghostLabel,
            variant === 'danger' && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.gold,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.mint,
  },
  danger: {
    backgroundColor: 'rgba(255, 107, 92, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 92, 0.5)',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 16,
  },
  secondaryLabel: {
    color: colors.chalk,
  },
  ghostLabel: {
    color: colors.chalkMuted,
  },
  dangerLabel: {
    color: colors.danger,
  },
});
