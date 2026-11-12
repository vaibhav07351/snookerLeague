import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface LiveResumeCardProps {
  eyebrow: string;
  title: string;
  meta: string;
  /** Optional quiet line under the meta, e.g. when the game was started. */
  note?: string;
  onPress: () => void;
  /** Idle for 12+ hours: toned down (grey dot, quiet card) with "Open" instead of "Resume". */
  stale?: boolean;
}

/** "Live now" card for an in-progress game; tapping it resumes scoring. */
export function LiveResumeCard({
  eyebrow,
  title,
  meta,
  note,
  onPress,
  stale = false,
}: LiveResumeCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const action = stale ? 'Open' : 'Resume';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action} ${eyebrow}: ${title}${note ? `. ${note}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, stale && styles.cardStale, pressed && styles.pressed]}
    >
      <View style={styles.copy}>
        <View style={styles.eyebrowRow}>
          <View style={[styles.dot, stale && styles.dotStale]} />
          <Text style={[styles.eyebrow, stale && styles.eyebrowStale]} numberOfLines={1}>
            {eyebrow}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {note ? (
          <Text style={styles.meta} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <View style={[styles.cta, stale && styles.ctaStale]}>
        <Ionicons
          name={stale ? 'open-outline' : 'play'}
          size={14}
          color={stale ? palette.text : palette.onPrimary}
        />
        <Text style={[styles.ctaText, stale && styles.ctaTextStale]}>{action}</Text>
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
    cardStale: {
      borderColor: c.border,
      backgroundColor: c.card,
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
    dotStale: {
      backgroundColor: c.textFaint,
    },
    eyebrowStale: {
      color: c.textMuted,
    },
    eyebrow: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      color: c.live,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.bodyLarge,
      lineHeight: 20,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.caption,
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
    ctaStale: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: 'transparent',
    },
    ctaText: {
      fontFamily: fonts.bodyBold,
      color: c.onPrimary,
      fontSize: typeScale.small,
    },
    ctaTextStale: {
      color: c.text,
    },
  });
