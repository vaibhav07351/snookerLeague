import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHint } from '@/shared/hooks/use-hint';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface GettingStartedStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  onPress: () => void;
}

/**
 * First-run checklist. Steps tick themselves off from real data; the card hides once
 * everything is done or the user dismisses it.
 */
export function GettingStartedCard({ steps }: { steps: GettingStartedStep[] }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { visible, dismiss } = useHint('home-getting-started');
  const doneCount = steps.filter((s) => s.done).length;
  if (!visible || doneCount === steps.length) {
    return null;
  }
  const nextKey = steps.find((s) => !s.done)?.key;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.progress}>
            {doneCount} of {steps.length} done
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide getting started"
          hitSlop={12}
          onPress={dismiss}
        >
          <Ionicons name="close" size={20} color={palette.textMuted} />
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${(doneCount / steps.length) * 100}%` }]} />
      </View>
      {steps.map((step) => {
        const isNext = step.key === nextKey;
        return (
          <Pressable
            key={step.key}
            accessibilityRole="button"
            accessibilityState={{ checked: step.done }}
            disabled={step.done}
            onPress={step.onPress}
            style={({ pressed }) => [
              styles.step,
              isNext && styles.stepNext,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={step.done ? palette.success : isNext ? palette.primary : palette.textMuted}
            />
            <View style={styles.stepText}>
              <Text style={[styles.stepLabel, step.done && styles.stepDone]}>{step.label}</Text>
              {!step.done ? <Text style={styles.stepHint}>{step.hint}</Text> : null}
            </View>
            {!step.done ? (
              <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
      marginBottom: spacing.md,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headText: {
      flex: 1,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    progress: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.chartTrack,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: c.primary,
    },
    step: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
    },
    stepNext: {
      backgroundColor: c.card,
    },
    pressed: {
      opacity: 0.8,
    },
    stepText: {
      flex: 1,
      minWidth: 0,
    },
    stepLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.text,
    },
    stepDone: {
      color: c.textMuted,
      textDecorationLine: 'line-through',
    },
    stepHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 16,
      color: c.textMuted,
    },
  });
