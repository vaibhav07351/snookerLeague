import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, Text, type TextInputProps } from 'react-native';

import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, style, ...rest }: FieldProps): ReactNode {
  return (
    <View style={styles.wrap}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.chalkMuted}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.chalk,
    fontSize: 17,
    fontFamily: fonts.body,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.danger,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
  },
});
