import type { ReactNode } from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

interface BrandLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function BrandLogo({ size = 88, style }: BrandLogoProps): ReactNode {
  return (
    <Image
      source={require('../../../../assets/snooker-logo.png')}
      accessibilityLabel="Snooker League logo"
      style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    resizeMode: 'cover',
  },
});
