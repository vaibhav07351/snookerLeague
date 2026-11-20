import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

interface BestOfPickerProps {
  value: number;
  onChange: (bestOf: number) => void;
  /** What the choice means, for example "First to 3 wins". */
  hint: string;
  /** Shown at the end of the heading row (the rules button). */
  accessory?: ReactNode;
}

/** "Best of" heading and the row of frame counts on "New match". */
export function BestOfPicker({ value, onChange, hint, accessory }: BestOfPickerProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <>
      <View style={styles.head}>
        <View style={styles.headLabel}>
          <Text style={styles.label}>Best of</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {accessory}
      </View>
      <View style={styles.row}>
        {BEST_OF_OPTIONS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`Best of ${n}`}
            accessibilityState={{ selected: value === n }}
            onPress={() => onChange(n)}
            style={[styles.option, value === n && styles.optionOn]}
          >
            <Text style={[styles.optionText, value === n && styles.optionTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    headLabel: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexShrink: 1,
      gap: spacing.sm,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      lineHeight: 17,
      color: c.textMuted,
      marginTop: 4,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    option: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    optionOn: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    optionText: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.lead,
      color: c.text,
    },
    optionTextOn: {
      color: c.onPrimary,
    },
  });
