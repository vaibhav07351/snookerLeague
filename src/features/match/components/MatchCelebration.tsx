import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

const HEADLINES_WIN = [
  'What a finish!',
  'Champions of the table',
  'Cue pure magic',
  'They owned the felt',
] as const;

const HEADLINES_FORFEIT = ['Win by forfeit', 'Walkover winners', 'Still counts'] as const;

const HEADLINES_CROWN = ['New reigning champs!', 'Crown secured', 'The throne is theirs'] as const;

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

export interface MatchCelebrationProps {
  winnersLabel: string;
  framesA: number;
  framesB: number;
  viaForfeit: boolean;
  crownsChampion: boolean;
  namedLabel: string | null;
  forfeitSummary: string | null;
  scoreLockedLine: string | null;
}

export function MatchCelebration({
  winnersLabel,
  framesA,
  framesB,
  viaForfeit,
  crownsChampion,
  namedLabel,
  forfeitSummary,
  scoreLockedLine,
}: MatchCelebrationProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const hero = useSharedValue(0);
  const pulse = useSharedValue(0);
  const glow = useSharedValue(0);

  const headlines = useMemo(() => {
    if (crownsChampion) {
      return HEADLINES_CROWN;
    }
    if (viaForfeit) {
      return HEADLINES_FORFEIT;
    }
    return HEADLINES_WIN;
  }, [crownsChampion, viaForfeit]);

  const activeHeadline = useRotatingHeadline(headlines);

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
  }, [hero, pulse, glow]);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: hero.value,
    transform: [
      { scale: interpolate(hero.value, [0, 1], [0.72, 1]) },
      { translateY: interpolate(hero.value, [0, 1], [28, 0]) },
    ],
  }));

  const scoreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.06]) }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.2 + glow.value * 0.35,
  }));
  const ringColor = viaForfeit ? palette.danger : palette.primary;

  return (
    <View style={styles.wrap}>
      <View style={styles.particleLayer} pointerEvents="none">
        {particles.map((p) => (
          <Particle key={p.id} spec={p} />
        ))}
      </View>

      <Animated.View
        style={[
          styles.card,
          { borderColor: ringColor, shadowColor: ringColor },
          ringStyle,
          heroStyle,
        ]}
      >
        <Text style={styles.kicker}>
          {crownsChampion ? 'Title match' : viaForfeit ? 'Forfeit result' : 'Match complete'}
        </Text>
        <Text style={styles.headline}>{activeHeadline}</Text>

        <Animated.Text style={[styles.score, scoreStyle]}>
          {framesA}-{framesB}
        </Animated.Text>

        <Text style={styles.winnersLabel}>Winners</Text>
        <Text style={styles.winners}>{winnersLabel}</Text>

        {namedLabel ? <Text style={styles.named}>{namedLabel}</Text> : null}
        {crownsChampion ? (
          <View style={styles.crownBadge}>
            <Text style={styles.crownText}>Reigning champions crowned</Text>
          </View>
        ) : null}
        {forfeitSummary ? <Text style={styles.detail}>{forfeitSummary}</Text> : null}
        {scoreLockedLine ? <Text style={styles.detailMuted}>{scoreLockedLine}</Text> : null}
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
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.primarySoft,
    },
    headline: {
      fontFamily: fonts.display,
      fontSize: 26,
      color: c.text,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: 52,
      color: c.primary,
      marginVertical: spacing.sm,
    },
    winnersLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.success,
    },
    winners: {
      fontFamily: fonts.bodyBold,
      fontSize: 20,
      color: c.text,
      textAlign: 'center',
      lineHeight: 28,
    },
    named: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.primarySoft,
      marginTop: spacing.xs,
    },
    crownBadge: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    crownText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.primary,
    },
    detail: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      color: c.text,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    detailMuted: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
