import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import type { BallValue } from '@/shared/types/domain';
import { fonts } from '@/theme/tokens';

interface BallStyle {
  label: string;
  name: string;
  base: string;
  mid: string;
  shadow: string;
  shine: string;
  text: string;
}

export const SNOOKER_BALLS: Record<BallValue, BallStyle> = {
  1: {
    label: 'R',
    name: 'Red',
    base: '#E02424',
    mid: '#B11212',
    shadow: '#6A0808',
    shine: '#FF9A90',
    text: '#FFFFFF',
  },
  2: {
    label: 'Y',
    name: 'Yellow',
    base: '#FFE14A',
    mid: '#E6C200',
    shadow: '#9A7A00',
    shine: '#FFF6B8',
    text: '#3A2A00',
  },
  3: {
    label: 'G',
    name: 'Green',
    base: '#2F9E44',
    mid: '#1B7A32',
    shadow: '#0B4A1C',
    shine: '#9BE7A8',
    text: '#FFFFFF',
  },
  4: {
    label: 'Br',
    name: 'Brown',
    base: '#A05A2C',
    mid: '#7A3F1A',
    shadow: '#3E1E0C',
    shine: '#E2B089',
    text: '#FFFFFF',
  },
  5: {
    label: 'Bl',
    name: 'Blue',
    base: '#2B7DE9',
    mid: '#1658B8',
    shadow: '#0A2F70',
    shine: '#A8D2FF',
    text: '#FFFFFF',
  },
  6: {
    label: 'P',
    name: 'Pink',
    base: '#FF6B9A',
    mid: '#F03E78',
    shadow: '#A01848',
    shine: '#FFD0E0',
    text: '#FFFFFF',
  },
  7: {
    label: 'K',
    name: 'Black',
    base: '#3A3A3A',
    mid: '#1A1A1A',
    shadow: '#050505',
    shine: '#9A9A9A',
    text: '#FFFFFF',
  },
};

interface SnookerBallProps {
  value: BallValue;
  size?: number;
}

export function SnookerBall({ value, size = 48 }: SnookerBallProps): ReactNode {
  const ball = SNOOKER_BALLS[value];
  const id = `ball-${value}`;
  const r = size / 2;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityLabel={`${ball.name} ${value}`}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="34%" cy="28%" rx="72%" ry="72%">
            <Stop offset="0%" stopColor={ball.shine} />
            <Stop offset="38%" stopColor={ball.base} />
            <Stop offset="78%" stopColor={ball.mid} />
            <Stop offset="100%" stopColor={ball.shadow} />
          </RadialGradient>
        </Defs>
        <Circle cx={r} cy={r} r={r - 0.6} fill={`url(#${id})`} />
        <Ellipse
          cx={size * 0.34}
          cy={size * 0.3}
          rx={size * 0.16}
          ry={size * 0.1}
          fill="rgba(255,255,255,0.55)"
        />
      </Svg>
      <Text style={[styles.label, { color: ball.text, fontSize: size < 42 ? 10 : 12 }]}>
        {ball.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    fontFamily: fonts.bodyBold,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
