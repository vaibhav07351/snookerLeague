import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

function openPage(path: string): void {
  const base = getApiBaseUrl() || 'https://snookit.duckdns.org';
  Linking.openURL(`${base}${path}`).catch((error: unknown) => {
    logger.warn('agree-terms', 'Could not open page', {
      path,
      shape: error instanceof Error ? error.name : 'unknown',
    });
  });
}

/** "I am 13 or older and accept the rules" tick box (decision D5), shown before sign-in. */
export function AgreeTerms({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="I am 13 or older and accept the community rules and privacy policy"
        onPress={() => onChange(!checked)}
        hitSlop={8}
        style={styles.box}
      >
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={24}
          color={checked ? palette.primary : palette.textMuted}
        />
      </Pressable>
      <Text style={styles.text}>
        I am 13 or older and accept the{' '}
        <Text style={styles.link} onPress={() => openPage('/terms')}>
          community rules
        </Text>{' '}
        and{' '}
        <Text style={styles.link} onPress={() => openPage('/privacy')}>
          privacy policy
        </Text>
        .
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    box: {
      minWidth: TOUCH_TARGET,
      minHeight: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    link: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      textDecorationLine: 'underline',
    },
  });
