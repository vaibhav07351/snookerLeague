import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

interface KeyValueRowProps {
  label: string;
  value: string;
}

/** One "label ..... value" line for detail panels. */
export function KeyValueRow({ label, value }: KeyValueRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    label: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      color: c.textMuted,
    },
    value: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
  });
