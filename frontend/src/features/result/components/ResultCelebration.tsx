import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { ResultMood, ResultView } from '@/features/result/types/result.types';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

const HEADLINES: Record<ResultMood, readonly string[]> = {
  win: ['What a finish!', 'Cue pure magic', 'Owned the felt', 'Top of the table'],
  forfeit: ['Win by forfeit', 'Walkover win', 'Still counts'],
  crown: ['A new champion!', 'Crown secured', 'The throne is taken'],
};
const HEADLINES_LIVE = ['Still in play'] as const;

/** Rows of a race or free-for-all shown on the card; the rest are in Details. */
const CARD_ROWS = 3;

interface ParticleSpec {
  id: number;
  leftPct: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
}

function Particle({ spec }: { spec: ParticleSpec }): ReactNode {
  const styles = useStyles(makeStyles);
  const progress = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, {
          duration: spec.duration,
          easing: Easing.out(Easing.quad),
        }),
        -1,
        false,
      ),
    );
    spin.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration * 0.8, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [progress, spin, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => {
    const y = interpolate(progress.value, [0, 1], [-20, 220]);
    const x = interpolate(progress.value, [0, 0.5, 1], [0, spec.drift, spec.drift * 0.4]);
    const opacity = interpolate(progress.value, [0, 0.12, 0.75, 1], [0, 1, 0.85, 0]);
    const scale = interpolate(progress.value, [0, 0.2, 1], [0.4, 1.15, 0.7]);
    const rotate = `${interpolate(spin.value, [0, 1], [0, 360])}deg`;
    return {
      transform: [{ translateY: y }, { translateX: x }, { scale }, { rotate }],
      opacity,
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          left: `${spec.leftPct}%`,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  );
}

function useRotatingHeadline(headlines: readonly string[]): string {
  const [text, setText] = useState(headlines[0] ?? '');

  useEffect(() => {
    setText(headlines[0] ?? '');
    if (headlines.length < 2) {
      return undefined;
    }
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % headlines.length;
      setText(headlines[i]!);
    }, 2800);
    return () => clearInterval(id);
  }, [headlines]);

  return text;
}

interface ResultCelebrationProps {
  view: ResultView;
  /** Extra line under the result, e.g. a forfeit explanation. */
  detail?: string | null;
}

/**
 * The finished-game card for a match, race or free-for-all: headline, the big score, the
 * winner and (for races and free-for-alls) the top places. Celebrates with confetti and a
 * gentle pulse; under reduce motion it only fades in.
 */
export function ResultCelebration({ view, detail = null }: ResultCelebrationProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const hero = useSharedValue(0);
  const pulse = useSharedValue(0);
  const glow = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  // A live public result is not a celebration: no confetti, no pulse.
  const still = reduceMotion || view.live;

  const activeHeadline = useRotatingHeadline(view.live ? HEADLINES_LIVE : HEADLINES[view.mood]);

  const particles = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        leftPct: 4 + ((i * 17) % 92),
        delay: (i % 6) * 120,
        duration: 2200 + (i % 5) * 280,
        size: 6 + (i % 4) * 3,
        color: palette.chart[i % palette.chart.length] ?? palette.primary,
        drift: (i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 6),
      })),
    [palette],
  );

  useEffect(() => {
    // Reduce motion: the card fades in and then holds still (no pulse, glow loop or confetti).
    if (still) {
      hero.value = withTiming(1, { duration: 250, reduceMotion: ReduceMotion.Never });
      pulse.value = 0;
      glow.value = 0.6;
      return;
    }
    hero.value = withSpring(1, { damping: 12, stiffness: 120 });
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 1400 }), withTiming(0.35, { duration: 1400 })),
      -1,
      false,
    );
  }, [hero, pulse, glow, still]);

  const heroStyle = useAnimatedStyle(() =>
    still
      ? { opacity: hero.value }
      : {
          opacity: hero.value,
          transform: [
            { scale: interpolate(hero.value, [0, 1], [0.72, 1]) },
            { translateY: interpolate(hero.value, [0, 1], [28, 0]) },
          ],
        },
  );

  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.06]) }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.2 + glow.value * 0.35,
  }));
  const ringColor = view.mood === 'forfeit' ? palette.danger : palette.primary;
  // The winner already leads the card; the places after it fit under the score.
  const others = view.standings.filter((r) => !r.winner).slice(0, CARD_ROWS - 1);

  return (
    <View style={styles.wrap}>
      {still ? null : (
        <View style={styles.particleLayer} pointerEvents="none">
          {particles.map((p) => (
            <Particle key={p.id} spec={p} />
          ))}
        </View>
      )}

      <Animated.View
        style={[
          styles.card,
          { borderColor: ringColor, shadowColor: ringColor },
          ringStyle,
          heroStyle,
        ]}
      >
        <Text style={styles.kicker}>{view.kicker}</Text>
        <Text style={styles.headline}>{activeHeadline}</Text>

        <Animated.Text style={[styles.score, scoreStyle]}>
          {view.score}
          {view.scoreUnit ? <Text style={styles.unit}> {view.scoreUnit}</Text> : null}
        </Animated.Text>

        {view.winnerLabel ? (
          <>
            <Text style={styles.winnersLabel}>{view.winnerHeading}</Text>
            <Text style={styles.winners}>{view.winnerLabel}</Text>
          </>
        ) : null}

        {others.length > 0 ? (
          <View style={styles.places}>
            {others.map((r) => (
              <Text key={`${r.place}-${r.name}`} style={styles.placeLine} numberOfLines={1}>
                <Text style={styles.placeNo}>{r.place}</Text> {r.name} · {r.detail}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.named} numberOfLines={1}>
          {view.label}
          {view.caption ? ` · ${view.caption}` : ''}
        </Text>
        {view.notes.map((note) => (
          <View key={note} style={styles.noteBadge}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ))}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
      overflow: 'hidden',
    },
    particleLayer: {
      ...StyleSheet.absoluteFill,
      zIndex: 2,
    },
    particle: {
      position: 'absolute',
      top: 0,
    },
    card: {
      zIndex: 1,
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: c.cardRaised,
      borderWidth: 2,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      elevation: 6,
      alignItems: 'center',
    },
    kicker: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.primarySoft,
    },
    headline: {
      fontFamily: fonts.display,
      fontSize: typeScale.display,
      color: c.text,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: typeScale.score,
      color: c.primary,
      marginVertical: spacing.sm,
    },
    winnersLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.success,
    },
    winners: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.title2,
      color: c.text,
      textAlign: 'center',
      lineHeight: 28,
    },
    named: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.body,
      color: c.primarySoft,
      marginTop: spacing.xs,
    },
    unit: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.lead,
      color: c.textMuted,
    },
    places: {
      alignSelf: 'stretch',
      gap: 2,
      alignItems: 'center',
    },
    placeLine: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.body,
      color: c.textMuted,
    },
    placeNo: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    noteBadge: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    noteText: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.small,
      color: c.primary,
    },
    detail: {
      fontFamily: fonts.body,
      fontSize: typeScale.body,
      lineHeight: 20,
      color: c.text,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  });
