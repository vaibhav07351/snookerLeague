import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLinkGoogle } from '@/features/auth/hooks/use-link-google';
import { useHint } from '@/shared/hooks/use-hint';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface LinkGoogleNudgeProps {
  /**
   * 'card' stays put until linked (Profile). 'strip' is a slim one-liner the player can
   * dismiss on this device (Home); "Show tips again" brings it back.
   */
  variant: 'card' | 'strip';
}

/** One-tap "link Google" prompt for local profiles. Renders nothing once linked. */
export function LinkGoogleNudge({ variant }: LinkGoogleNudgeProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { available, linking, link } = useLinkGoogle();
  const hint = useHint('home-link-google');

  if (!available || (variant === 'strip' && !hint.visible)) {
    return null;
  }

  const strip = variant === 'strip';
  const title = strip ? 'Back up your games with Google' : 'Connect Google';
  const subtitle = "Keep your matches safe, sync devices and join friends' leagues.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ busy: linking, disabled: linking }}
      disabled={linking}
      onPress={() => void link()}
      style={({ pressed }) => [
        styles.base,
        strip ? styles.strip : styles.card,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, strip && styles.iconSmall]}>
        <Ionicons name="logo-google" size={strip ? 14 : 18} color={palette.primary} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, strip && styles.titleSmall]} numberOfLines={1}>
          {title}
        </Text>
        {strip ? null : (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {linking ? (
        <ActivityIndicator color={palette.primary} />
      ) : (
        <Text style={styles.action}>Link</Text>
      )}
      {strip ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hide Google backup reminder"
          hitSlop={12}
          onPress={hint.dismiss}
        >
          <Ionicons name="close" size={18} color={palette.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    card: {
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderColor: c.primary,
    },
    strip: {
      minHeight: 44,
      paddingHorizontal: spacing.sm + 4,
      marginBottom: spacing.md,
    },
    pressed: {
      opacity: 0.75,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    iconSmall: {
      width: 26,
      height: 26,
    },
    text: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    titleSmall: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 16,
      color: c.textMuted,
    },
    action: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.primary,
    },
  });
