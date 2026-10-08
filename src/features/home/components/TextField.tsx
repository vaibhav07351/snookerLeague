import type { ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, Text, type TextInputProps } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
}

export function TextField({ label, hint, error, style, ...rest }: FieldProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  return (
    <View style={styles.wrap}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.textFaint}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    input: {
      backgroundColor: c.card,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      color: c.text,
      // 16px on web avoids mobile Safari auto-zoom on focus.
      fontSize: Platform.OS === 'web' ? 16 : 17,
      fontFamily: fonts.body,
      minHeight: 52,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
    },
    inputError: {
      borderColor: c.danger,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
      lineHeight: 18,
    },
    error: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.danger,
    },
  });
