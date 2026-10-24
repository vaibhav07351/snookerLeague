import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { BrandLogo } from '@/features/home/components/BrandLogo';
import { SnookerBall } from '@/features/match/components/SnookerBall';
import type { BallValue } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export type WelcomeArtKind = 'club' | 'players' | 'scoring' | 'champions';

const ART_SIZE = 220;

/** The illustration at the top of each welcome slide. Built from app pieces, no images. */
export function WelcomeArt({ kind }: { kind: WelcomeArtKind }): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <View
      style={styles.stage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {kind === 'club' ? <ClubArt /> : null}
      {kind === 'players' ? <PlayersArt /> : null}
      {kind === 'scoring' ? <ScoringArt /> : null}
      {kind === 'champions' ? <ChampionsArt /> : null}
    </View>
  );
}

/** 0 -> 1 once, after `delay`; instant when the user prefers reduced motion. */
function useEntrance(delay: number): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 140 }));
  }, [delay, progress, reduceMotion]);
  return progress;
}

/** Endless 0 -> 1 loop for ambient motion; stays at 0 with reduced motion. */
function useLoop(duration: number, delay = 0): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false),
    );
    return () => cancelAnimation(progress);
  }, [delay, duration, progress, reduceMotion]);
  return progress;
}

function ClubArt(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const pop = useEntrance(0);
  const orbit = useLoop(9000);
  const breathe = useLoop(2600);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + pop.value * 0.4 }],
  }));
  const haloStyle = useAnimatedStyle(() => {
    const wave = Math.sin(breathe.value * Math.PI * 2);
    return { opacity: 0.35 + wave * 0.15, transform: [{ scale: 1 + wave * 0.05 }] };
  });
  const orbitStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ rotate: `${orbit.value * 360}deg` }],
  }));

  const orbitBalls: BallValue[] = [1, 5, 7];
  return (
    <>
      <Animated.View style={[styles.halo, { backgroundColor: palette.primarySoft }, haloStyle]} />
      <Animated.View style={[styles.orbit, { borderColor: palette.border }, orbitStyle]}>
        {orbitBalls.map((value, i) => {
          const angle = (i / orbitBalls.length) * Math.PI * 2;
          const r = ART_SIZE / 2 - 14;
          return (
            <View
              key={value}
              style={[
                styles.orbitBall,
                {
                  left: ART_SIZE / 2 + Math.cos(angle) * r - 14,
                  top: ART_SIZE / 2 + Math.sin(angle) * r - 14,
                },
              ]}
            >
              <SnookerBall value={value} size={28} />
            </View>
          );
        })}
      </Animated.View>
      <Animated.View style={logoStyle}>
        <BrandLogo size={112} />
      </Animated.View>
    </>
  );
}

function PlayersArt(): ReactNode {
  const styles = useStyles(makeStyles);
  const vs = useEntrance(520);
  const vsStyle = useAnimatedStyle(() => ({
    opacity: vs.value,
    transform: [{ scale: 0.5 + vs.value * 0.5 }],
  }));
  return (
    <View style={styles.rosterRow}>
      <View style={styles.pair}>
        <Avatar index={0} initial="A" side="a" />
        <Avatar index={1} initial="B" side="a" />
      </View>
      <Animated.Text style={[styles.vs, vsStyle]}>vs</Animated.Text>
      <View style={styles.pair}>
        <Avatar index={2} initial="C" side="b" />
        <Avatar index={3} initial="D" side="b" guest />
      </View>
    </View>
  );
}

function Avatar({
  index,
  initial,
  side,
  guest = false,
}: {
  index: number;
  initial: string;
  side: 'a' | 'b';
  /** Shows the "guest" tag: a player without the app. */
  guest?: boolean;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const pop = useEntrance(index * 120);
  const tone = side === 'a' ? palette.teamA : palette.teamB;
  const soft = side === 'a' ? palette.teamASoft : palette.teamBSoft;
  const style = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: (1 - pop.value) * 24 }, { scale: 0.7 + pop.value * 0.3 }],
  }));
  return (
    <Animated.View style={[styles.avatar, { borderColor: tone, backgroundColor: soft }, style]}>
      <Text style={[styles.avatarText, { color: tone }]}>{initial}</Text>
      {guest ? (
        <View style={[styles.guestTag, { backgroundColor: palette.cardRaised }]}>
          <Text style={styles.guestText}>guest</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const PAD_BALLS: BallValue[] = [1, 2, 3, 4, 5, 6, 7];

function ScoringArt(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const chip = useEntrance(700);
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ translateY: (1 - chip.value) * -12 }],
  }));
  return (
    <View style={styles.scoring}>
      <Animated.View style={[styles.breakChip, { backgroundColor: palette.primary }, chipStyle]}>
        <Text style={[styles.breakText, { color: palette.onPrimary }]}>Break 27</Text>
      </Animated.View>
      <View
        style={[styles.cloth, { backgroundColor: palette.table, borderColor: palette.tableEdge }]}
      >
        {PAD_BALLS.map((value, i) => (
          <BouncingBall key={value} value={value} index={i} />
        ))}
      </View>
    </View>
  );
}

function BouncingBall({ value, index }: { value: BallValue; index: number }): ReactNode {
  const reduceMotion = useReducedMotion();
  const pop = useEntrance(index * 70);
  const hop = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    // A Mexican wave across the pad: each ball hops a beat after the one before.
    hop.value = withDelay(
      800 + index * 140,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 1400 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(hop);
  }, [hop, index, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ translateY: -hop.value * 14 + (1 - pop.value) * 20 }],
  }));
  return (
    <Animated.View style={style}>
      <SnookerBall value={value} size={30} />
    </Animated.View>
  );
}

const BARS = [0.45, 0.7, 1] as const;

function ChampionsArt(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const pop = useEntrance(380);
  const shine = useLoop(2400, 900);
  const trophyStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [
      { scale: 0.5 + pop.value * 0.5 },
      { rotate: `${Math.sin(shine.value * Math.PI * 2) * 4}deg` },
    ],
  }));
  return (
    <View style={styles.champions}>
      <Animated.View style={[styles.trophy, trophyStyle]}>
        <Ionicons name="trophy" size={72} color={palette.primary} />
      </Animated.View>
      <View style={styles.bars}>
        {BARS.map((height, i) => (
          <Bar key={i} index={i} height={height} />
        ))}
      </View>
    </View>
  );
}

function Bar({ index, height }: { index: number; height: number }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const grow = useEntrance(index * 140);
  const style = useAnimatedStyle(() => ({ height: 16 + grow.value * height * 70 }));
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: index === 2 ? palette.primary : palette.chartTrack },
        style,
      ]}
    />
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    stage: {
      width: ART_SIZE,
      height: ART_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    halo: {
      position: 'absolute',
      width: ART_SIZE * 0.78,
      height: ART_SIZE * 0.78,
      borderRadius: ART_SIZE,
    },
    orbit: {
      position: 'absolute',
      width: ART_SIZE,
      height: ART_SIZE,
      borderRadius: ART_SIZE / 2,
      borderWidth: 1,
      borderStyle: 'dashed',
    },
    orbitBall: {
      position: 'absolute',
    },
    rosterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    pair: {
      gap: spacing.md,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: fonts.display,
      fontSize: 24,
    },
    guestTag: {
      position: 'absolute',
      bottom: -8,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
    },
    guestText: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      color: c.textMuted,
    },
    vs: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      letterSpacing: 1,
      color: c.textMuted,
    },
    scoring: {
      alignItems: 'center',
      gap: spacing.lg,
    },
    breakChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: radii.pill,
    },
    breakText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    cloth: {
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 12,
      borderRadius: radii.md,
      borderWidth: 3,
    },
    champions: {
      alignItems: 'center',
      gap: spacing.md,
    },
    trophy: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    bars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      height: 86,
    },
    bar: {
      width: 26,
      borderTopLeftRadius: radii.xs,
      borderTopRightRadius: radii.xs,
    },
  });
