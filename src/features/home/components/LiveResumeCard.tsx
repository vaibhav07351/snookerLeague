import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

interface LiveResumeCardProps {
  eyebrow: string;
  title: string;
  meta: string;
  onPress: () => void;
}

export function LiveResumeCard({ eyebrow, title, meta, onPress }: LiveResumeCardProps): ReactNode {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Resume ${eyebrow}: ${title}`}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.cta}>Resume</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.mint,
    backgroundColor: 'rgba(94, 228, 168, 0.12)',
    marginBottom: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    color: colors.mint,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 15,
    lineHeight: 20,
  },
  meta: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
  },
  cta: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
  },
});
