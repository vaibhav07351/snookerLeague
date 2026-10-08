import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStyles } from '@/theme/ThemeProvider';
import type { Palette } from '@/theme/tokens';

/** Subtle themed backdrop: base colour plus two soft glows and a thin primary rail. */
export function FeltAtmosphere(): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      <View style={[StyleSheet.absoluteFill, styles.base]} />
      <View style={styles.glowA} />
      <View style={styles.glowB} />
      <View style={styles.rail} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    clip: {
      overflow: 'hidden',
    },
    base: {
      backgroundColor: c.bg,
    },
    glowA: {
      position: 'absolute',
      top: -120,
      right: -80,
      width: 320,
      height: 320,
      borderRadius: 160,
      backgroundColor: c.glowA,
    },
    glowB: {
      position: 'absolute',
      bottom: -100,
      left: -100,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: c.glowB,
    },
    rail: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 2,
      backgroundColor: c.primary,
      opacity: 0.7,
    },
  });
