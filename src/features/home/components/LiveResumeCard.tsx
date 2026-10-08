import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface LiveResumeCardProps {
  eyebrow: string;
  title: string;
  meta: string;
  onPress: () => void;
}

/** "Live now" card for an in-progress match or race; tapping it resumes scoring. */
export function LiveResumeCard({ eyebrow, title, meta, onPress }: LiveResumeCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${eyebrow}: ${title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <View style={styles.dot} />
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.cta}>
        <Ionicons name="play" size={14} color={palette.onPrimary} />
        <Text style={styles.ctaText}>Resume</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
      marginBottom: spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eyebrowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    eyebrow: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      color: c.live,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
      lineHeight: 20,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: radii.pill,
      backgroundColor: c.primary,
    },
    ctaText: {
      fontFamily: fonts.bodyBold,
      color: c.onPrimary,
      fontSize: 13,
    },
  });
