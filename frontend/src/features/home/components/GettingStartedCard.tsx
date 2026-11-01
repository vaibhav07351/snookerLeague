import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useHint } from '@/shared/hooks/use-hint';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface GettingStartedStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  onPress: () => void;
}

const RING = 40;
const STROKE = 4;

/**
 * First-run checklist as a single row: tapping it jumps straight to the next step. The full
 * list lives in a sheet so the home screen stays short. Steps tick themselves off from real
 * data; the row hides once everything is done or the user dismisses it.
 */
export function GettingStartedCard({ steps }: { steps: GettingStartedStep[] }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { visible, dismiss } = useHint('home-getting-started');
  const [listOpen, setListOpen] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  if (!visible || doneCount === steps.length) {
    return null;
  }
  const nextStep = steps.find((s) => !s.done) ?? null;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextStep ? `Next step: ${nextStep.label}` : 'Getting started'}
        onPress={nextStep ? nextStep.onPress : () => setListOpen(true)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <ProgressRing done={doneCount} total={steps.length} />
        <View style={styles.headText}>
          <Text style={styles.progress}>
            Get started · {doneCount} of {steps.length}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {nextStep ? nextStep.label : 'All set'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.primary} />
      </Pressable>
      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="See all getting started steps"
          hitSlop={8}
          onPress={() => setListOpen(true)}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Ionicons name="list" size={18} color={palette.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide getting started"
          hitSlop={8}
          onPress={dismiss}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Ionicons name="close" size={18} color={palette.textMuted} />
        </Pressable>
      </View>

      <BottomSheet visible={listOpen} title="Get started" onClose={() => setListOpen(false)}>
        {steps.map((step) => (
          <StepRow
            key={step.key}
            step={step}
            isNext={step.key === nextStep?.key}
            onPress={() => {
              setListOpen(false);
              step.onPress();
            }}
          />
        ))}
      </BottomSheet>
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

interface StepRowProps {
  step: GettingStartedStep;
  isNext: boolean;
  onPress: () => void;
}

function StepRow({ step, isNext, onPress }: StepRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ checked: step.done }}
      disabled={step.done}
      onPress={onPress}
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      paddingLeft: spacing.sm,
      paddingRight: spacing.xs,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
      marginBottom: spacing.md,
    },
    head: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    side: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
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
      fontSize: 11,
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
  });
