import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLayout } from '@/shared/hooks/use-layout';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface LiveGameHeaderProps {
  /** Small caps line over the title (the game's own name), if any. */
  label?: string | null;
  /** e.g. "Race to 50" or "Frame 2 of 3". */
  title: string;
  /** Shows a trophy pill: this game crowns a champion. */
  crown?: boolean;
}

/** Top of a live race or free-for-all: its name, what is being played, and a Live pill. */
export function LiveGameHeader({ label, title, crown = false }: LiveGameHeaderProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { scale } = useLayout();
  return (
    <View style={styles.header}>
      <View style={styles.text}>
        {label ? (
          <Text style={typography.label} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        <Text style={[styles.title, { fontSize: scale(typeScale.display) }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.meta}>
        {crown ? (
          <View style={styles.crownPill} accessibilityLabel="Crowns a champion">
            <Ionicons name="trophy" size={12} color={palette.primary} />
          </View>
        ) : null}
        <View style={styles.statusPill}>
          <View style={styles.liveDot} />
          <Text style={styles.statusText}>Live</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.display,
      color: c.text,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    crownPill: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.live,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    statusText: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.caption,
    },
  });
