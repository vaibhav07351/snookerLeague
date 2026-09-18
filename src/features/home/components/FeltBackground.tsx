import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/** Soft sunny felt atmosphere — cheerful, not gloomy. */
export function FeltAtmosphere(): ReactNode {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.base]} />
      <View style={styles.sunBlob} />
      <View style={styles.mintBlob} />
      <View style={styles.coralBlob} />
      <View style={styles.glowTop} />
      <View style={styles.rail} />
    </View>
  );
}

export const LinearGradientPlaceholder = FeltAtmosphere;

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.felt,
  },
  sunBlob: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.sun,
    opacity: 0.18,
  },
  mintBlob: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.mint,
    opacity: 0.12,
  },
  coralBlob: {
    position: 'absolute',
    bottom: -20,
    right: 40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.coral,
    opacity: 0.1,
  },
  glowTop: {
    position: 'absolute',
    top: -60,
    left: -40,
    right: -40,
    height: 220,
    backgroundColor: colors.feltMid,
    opacity: 0.55,
    borderBottomLeftRadius: 180,
    borderBottomRightRadius: 180,
  },
  rail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.gold,
    opacity: 0.9,
  },
});
