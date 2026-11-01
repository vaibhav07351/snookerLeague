import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/shared/ui/Screen';
import { SnookerBall } from '@/features/match/components/SnookerBall';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { DARK_THEME_ORDER, PALETTES, type ThemeId } from '@/theme/palettes';
import { useStyles, useTheme } from '@/theme/ThemeProvider';
import { THEME_MODE_LABELS, THEME_MODES, type ThemeMode } from '@/theme/theme-preference';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

const MODE_ITEMS = THEME_MODES.map((key) => ({ key, label: THEME_MODE_LABELS[key] }));

const MODE_HINTS: Record<ThemeMode, string> = {
  light: 'Always light, whatever your phone is set to.',
  dark: 'Always dark, in the style you pick below.',
  system: 'Follows your phone: light by day, your dark style when the phone goes dark.',
};

/** Appearance: light, dark or follow the phone, plus which dark style. Saved on this device. */
export default function ThemeSettingsScreen(): ReactNode {
  const { mode, darkThemeId, setMode, setDarkThemeId } = useTheme();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);

  return (
    <Screen>
      <SectionTitle title="Mode" />
      <SegmentedTabs items={MODE_ITEMS} value={mode} onChange={setMode} />
      <Text style={[typography.caption, styles.hint]}>{MODE_HINTS[mode]}</Text>

      <SectionTitle title="Dark style" />
      <View style={styles.list}>
        {DARK_THEME_ORDER.map((id) => (
          <ThemeOption
            key={id}
            id={id}
            selected={id === darkThemeId}
            onSelect={() => setDarkThemeId(id)}
          />
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
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={24} color={preview.primary} /> : null}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hint: {
      marginTop: spacing.sm,
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
  });
