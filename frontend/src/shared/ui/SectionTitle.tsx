import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

interface SectionTitleProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Small uppercase section label with an optional right-aligned action link. */
export function SectionTitle({ title, actionLabel, onAction }: SectionTitleProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  return (
    <View style={styles.row}>
      <Text style={[typography.label, styles.title]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      gap: spacing.sm,
    },
    title: {
      flexShrink: 1,
    },
    action: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 13,
    },
  });
