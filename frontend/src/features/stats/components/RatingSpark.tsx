import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, type Palette } from '@/theme/tokens';

interface RatingSparkProps {
  /** Rating after each recent result, oldest first. */
  history: number[];
  width: number;
  height?: number;
}

/** Rating trend line scaled to its own range, so small moves are visible. */
export function RatingSpark({ history, width, height = 72 }: RatingSparkProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  if (history.length < 2) {
    return <Text style={styles.empty}>The trend line appears after two results.</Text>;
  }
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = Math.max(max - min, 1);
  const pad = 6;
  const points = history.map((value, i) => {
    const x = pad + (i / (history.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const last = points[points.length - 1]!;
  return (
    <View>
      <Svg width={width} height={height}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={palette.primary}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={last.x} cy={last.y} r={4} fill={palette.primary} />
      </Svg>
      <View style={styles.scale}>
        <Text style={styles.scaleText}>Low {min}</Text>
        <Text style={styles.scaleText}>High {max}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    empty: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    scale: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    scaleText: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: c.textMuted,
    },
  });
