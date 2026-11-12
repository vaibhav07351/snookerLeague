import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

interface ToggleRowProps {
  title: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A setting that is on or off: title and a short hint on the left, the switch on the right. */
export function ToggleRow({ title, hint, value, onChange }: ToggleRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ false: palette.cardRaised, true: palette.primary }}
        thumbColor={palette.text}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.bodyLarge,
      color: c.text,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      lineHeight: 17,
      color: c.textMuted,
      marginTop: 4,
    },
  });
