import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/features/home/components/Screen';
import { SnookerBall } from '@/features/match/components/SnookerBall';
import { PALETTES, THEME_ORDER, type ThemeId } from '@/theme/palettes';
import { useStyles, useTheme } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Theme picker. The choice is saved on this device and applies instantly. */
export default function ThemeSettingsScreen(): ReactNode {
  const { themeId, setThemeId } = useTheme();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);

  return (
    <Screen>
      <Text style={typography.title}>Appearance</Text>
      <Text style={[typography.subtitle, styles.intro]}>
        Pick the look you like. It changes straight away and is saved on this device.
      </Text>
      <View style={styles.list}>
        {THEME_ORDER.map((id) => (
          <ThemeOption key={id} id={id} selected={id === themeId} onSelect={() => setThemeId(id)} />
        ))}
      </View>
    </Screen>
  );
}

function ThemeOption({
  id,
  selected,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const preview = PALETTES[id];
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${preview.name} theme`}
      onPress={onSelect}
      style={[styles.option, selected && styles.optionOn]}
    >
      <View style={[styles.swatch, { backgroundColor: preview.bg, borderColor: preview.border }]}>
        <View style={[styles.swatchBar, { backgroundColor: preview.bgElevated }]} />
        <View style={styles.swatchRow}>
          <View style={[styles.dot, { backgroundColor: preview.teamA }]} />
          <View style={[styles.pill, { backgroundColor: preview.primary }]} />
          <View style={[styles.dot, { backgroundColor: preview.teamB }]} />
        </View>
        <View style={[styles.table, { backgroundColor: preview.table }]}>
          <SnookerBall value={1} size={12} />
          <SnookerBall value={7} size={12} />
        </View>
      </View>
      <View style={styles.optionText}>
        <Text style={styles.optionName}>{preview.name}</Text>
        <Text style={styles.optionMeta}>{preview.isDark ? 'Dark' : 'Light'}</Text>
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={24} color={preview.primary} /> : null}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    intro: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    list: {
      gap: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    optionOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    swatch: {
      width: 84,
      height: 64,
      borderRadius: radii.sm,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 6,
      gap: 5,
    },
    swatchBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 10,
    },
    swatchRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    pill: {
      flex: 1,
      height: 8,
      borderRadius: 4,
    },
    table: {
      flex: 1,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    optionText: {
      flex: 1,
      minWidth: 0,
    },
    optionName: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    optionMeta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
    },
  });
