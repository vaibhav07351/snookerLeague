import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHint, type HintKey } from '@/shared/hooks/use-hint';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface HintCardProps {
  hintKey: HintKey;
  title: string;
  /** Short tips, one per line. */
  tips: string[];
}

/** First-time tip that stays out of the way once dismissed. */
export function HintCard({ hintKey, title, tips }: HintCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { visible, dismiss } = useHint(hintKey);
  if (!visible) {
    return null;
  }
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.head}>
        <Ionicons name="bulb-outline" size={18} color={palette.info} />
        <Text style={styles.title}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss tip"
          hitSlop={12}
          onPress={dismiss}
        >
          <Ionicons name="close" size={20} color={palette.textMuted} />
        </Pressable>
      </View>
      {tips.map((tip) => (
        <View key={tip} style={styles.tipRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.tip}>{tip}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={dismiss} style={styles.gotIt} hitSlop={8}>
        <Text style={styles.gotItText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: 6,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.info,
      backgroundColor: c.card,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    tipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    bullet: {
      fontFamily: fonts.bodyBold,
      color: c.info,
      fontSize: 14,
      lineHeight: 20,
    },
    tip: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      color: c.textMuted,
    },
    gotIt: {
      alignSelf: 'flex-end',
      paddingVertical: 4,
    },
    gotItText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.info,
    },
  });
