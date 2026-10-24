import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

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

const RING = 48;
const STROKE = 5;

/**
 * First-run checklist. Steps tick themselves off from real data; the card hides once
 * everything is done or the user dismisses it. Compact: only the next step is shown until
 * the list is expanded.
 */
export function GettingStartedCard({ steps }: { steps: GettingStartedStep[] }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { visible, dismiss } = useHint('home-getting-started');
  const [expanded, setExpanded] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  if (!visible || doneCount === steps.length) {
    return null;
  }
  const nextStep = steps.find((s) => !s.done) ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <ProgressRing done={doneCount} total={steps.length} />
        <View style={styles.headText}>
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.progress}>
            {doneCount} of {steps.length} done · a minute or two
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

      {expanded ? (
        steps.map((step) => (
          <StepRow key={step.key} step={step} isNext={step.key === nextStep?.key} />
        ))
      ) : nextStep ? (
        <StepRow step={nextStep} isNext />
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={8}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {expanded ? 'Show less' : `See all ${steps.length} steps`}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={palette.textMuted}
        />
      </Pressable>
    </View>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = total > 0 ? (done / total) * circumference : 0;
  return (
    <View
      style={styles.ring}
      accessibilityLabel={`${done} of ${total} steps done`}
      accessibilityRole="progressbar"
    >
      <Svg width={RING} height={RING}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={palette.chartTrack}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={palette.primary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          fill="none"
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>
        {done}/{total}
      </Text>
    </View>
  );
}

function StepRow({ step, isNext }: { step: GettingStartedStep; isNext: boolean }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: step.done }}
      disabled={step.done}
      onPress={step.onPress}
      style={({ pressed }) => [styles.step, isNext && styles.stepNext, pressed && styles.pressed]}
    >
      <Ionicons
        name={step.done ? 'checkmark-circle' : isNext ? 'arrow-forward-circle' : 'ellipse-outline'}
        size={22}
        color={step.done ? palette.success : isNext ? palette.primary : palette.textMuted}
      />
      <View style={styles.stepText}>
        <Text style={[styles.stepLabel, step.done && styles.stepDone]}>{step.label}</Text>
        {!step.done ? <Text style={styles.stepHint}>{step.hint}</Text> : null}
      </View>
      {!step.done ? <Ionicons name="chevron-forward" size={16} color={palette.textMuted} /> : null}
    </Pressable>
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
      gap: 12,
    },
    headText: {
      flex: 1,
      minWidth: 0,
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
    ring: {
      width: RING,
      height: RING,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringText: {
      position: 'absolute',
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.text,
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
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 32,
    },
    toggleText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
    },
  });
