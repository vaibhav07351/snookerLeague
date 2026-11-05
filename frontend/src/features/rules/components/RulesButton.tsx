import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RuleSet } from '@/features/rules/services/rules';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface RulesButtonProps {
  rules: RuleSet;
  /** Icon only, for a crowded header. The label is still read out by screen readers. */
  iconOnly?: boolean;
}

/**
 * Small "How it works" pill that opens the rules for this mode in a sheet, so a new player
 * can check how results are decided without the screen growing a block of text.
 */
export function RulesButton({ rules, iconOnly = false }: RulesButtonProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={rules.title}
        hitSlop={6}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [iconOnly ? styles.icon : styles.pill, pressed && styles.pressed]}
      >
        <Ionicons
          name="information-circle-outline"
          size={iconOnly ? 22 : 16}
          color={iconOnly ? palette.textMuted : palette.primary}
        />
        {iconOnly ? null : <Text style={styles.pillText}>How it works</Text>}
      </Pressable>
      <BottomSheet visible={open} title={rules.title} onClose={() => setOpen(false)}>
        <View style={styles.list}>
          {rules.lines.map((line) => (
            <View key={line} style={styles.row}>
              <View style={styles.dot} />
              <Text style={styles.line}>{line}</Text>
            </View>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      minHeight: TOUCH_TARGET - 12,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
    },
    icon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
    },
    pressed: {
      opacity: 0.6,
    },
    pillText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.primary,
    },
    list: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginTop: 8,
      backgroundColor: c.primary,
    },
    line: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 15,
      lineHeight: 22,
      color: c.text,
    },
  });
