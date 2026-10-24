import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/features/home/components/Button';
import { FeltAtmosphere } from '@/features/home/components/FeltBackground';
import { WelcomeArt, type WelcomeArtKind } from '@/features/tour/components/WelcomeArt';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

interface Slide {
  art: WelcomeArtKind;
  eyebrow: string;
  title: string;
  body: string;
}

const WELCOME_SLIDE: Slide = {
  art: 'club',
  eyebrow: 'Welcome to Snookit',
  title: 'Your snooker club, in your pocket',
  body: 'Score games with friends, crown champions and finally settle who really runs the table.',
};

const SLIDES: readonly Slide[] = [
  WELCOME_SLIDE,
  {
    art: 'players',
    eyebrow: 'Step 1',
    title: 'Start with your table',
    body: 'Add the people you play with. Friends without the app join as guests and claim their card later.',
  },
  {
    art: 'scoring',
    eyebrow: 'Step 2',
    title: 'Score live, ball by ball',
    body: 'Tap balls as they drop. Breaks, frames and fouls are counted for you, and friends can follow live.',
  },
  {
    art: 'champions',
    eyebrow: 'Step 3',
    title: 'Champions and bragging rights',
    body: 'Every frame feeds the leaderboard, rivalries and title races. No more arguing about who won.',
  },
];

/** A swipe shorter than this snaps back instead of changing slide. */
const SWIPE_THRESHOLD = 48;

interface WelcomeStoryProps {
  /** `showTour` is true when they asked to be shown around. */
  onClose: (showTour: boolean) => void;
}

/** Full-screen first-run story: what the app is for, before pointing at buttons. */
export function WelcomeStory({ onClose }: WelcomeStoryProps): ReactNode {
  const styles = useStyles(makeStyles);
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const slide = SLIDES[index] ?? WELCOME_SLIDE;
  const isLast = index === SLIDES.length - 1;

  const enter = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    enter.value = 0;
    enter.value = withTiming(1, {
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
    });
    AccessibilityInfo.announceForAccessibility(`${slide.title}. ${slide.body}`);
  }, [enter, reduceMotion, slide]);

  function go(next: number): void {
    if (next < 0 || next >= SLIDES.length || next === index) {
      return;
    }
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  }

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-16, 16])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      drag.value = e.translationX * 0.35;
    })
    .onEnd((e) => {
      drag.value = withTiming(0, { duration: 180 });
      if (e.translationX < -SWIPE_THRESHOLD) {
        go(index + 1);
      } else if (e.translationX > SWIPE_THRESHOLD) {
        go(index - 1);
      }
    });

  const slideStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 48 * direction + drag.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 14 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <FeltAtmosphere />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topBar}>
          <Text style={styles.counter}>
            {index + 1} / {SLIDES.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip the introduction"
            onPress={() => onClose(false)}
            hitSlop={8}
            style={styles.skip}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        <GestureDetector gesture={swipe}>
          <View style={styles.body}>
            {/* key remounts the art so each slide replays its entrance. */}
            <Animated.View key={slide.art} style={[styles.artWrap, slideStyle]}>
              <WelcomeArt kind={slide.art} />
            </Animated.View>
            <Animated.View style={[styles.copy, textStyle]}>
              <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {slide.title}
              </Text>
              <Text style={styles.text}>{slide.body}</Text>
            </Animated.View>
          </View>
        </GestureDetector>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <Pressable
                key={s.art}
                accessibilityRole="button"
                accessibilityLabel={`Go to slide ${i + 1}`}
                accessibilityState={{ selected: i === index }}
                onPress={() => go(i)}
                hitSlop={10}
              >
                <View style={[styles.dot, i === index && styles.dotOn]} />
              </Pressable>
            ))}
          </View>
          <Button
            label={isLast ? 'Show me around' : 'Next'}
            icon={isLast ? 'compass-outline' : 'arrow-forward'}
            onPress={() => (isLast ? onClose(true) : go(index + 1))}
          />
          {index > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => go(index - 1)} style={styles.back}>
              <Text style={styles.skipText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.back} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      paddingHorizontal: spacing.lg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: TOUCH_TARGET,
    },
    counter: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textFaint,
    },
    skip: {
      minHeight: TOUCH_TARGET,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    skipText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.textMuted,
    },
    body: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
    },
    artWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      alignItems: 'center',
      gap: spacing.sm,
      maxWidth: 420,
    },
    eyebrow: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.primary,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 26,
      lineHeight: 34,
      textAlign: 'center',
      color: c.text,
    },
    text: {
      fontFamily: fonts.body,
      fontSize: 16,
      lineHeight: 24,
      textAlign: 'center',
      color: c.textMuted,
    },
    footer: {
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: c.chartTrack,
    },
    dotOn: {
      width: 24,
      backgroundColor: c.primary,
    },
    back: {
      minHeight: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
