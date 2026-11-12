import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useParkedWrites } from '@/shared/hooks/use-parked-writes';
import { isStoreReadOnly, subscribeStore } from '@/shared/storage/local-store';
import { isCloudReachable, subscribeCloudReachable } from '@/shared/sync/sync-status';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

/**
 * Slim notice at the top of the app, most serious first: this phone's saved data could not be
 * read (saving is paused), changes the server would not take (with Retry and Discard), or the
 * server cannot be reached (everything keeps working locally).
 */
export function SyncBanner(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [reachable, setReachable] = useState(isCloudReachable());
  const [readOnly, setReadOnly] = useState(isStoreReadOnly());
  const parked = useParkedWrites();

  useEffect(() => subscribeCloudReachable(setReachable), []);
  useEffect(() => subscribeStore(() => setReadOnly(isStoreReadOnly())), []);

  const barStyle = [styles.bar, { paddingTop: insets.top + 6 }];

  if (readOnly) {
    return (
      <View style={barStyle} accessibilityRole="alert">
        <Ionicons name="warning-outline" size={16} color={palette.warning} />
        <Text style={styles.text}>
          Saved data on this phone could not be read, so saving is paused to protect it. Restart the
          app; if this keeps showing, contact support before reinstalling.
        </Text>
      </View>
    );
  }
  if (parked.count > 0) {
    return (
      <View style={barStyle} accessibilityRole="alert">
        <Ionicons name="alert-circle-outline" size={16} color={palette.warning} />
        <Text style={styles.text}>
          {parked.count === 1
            ? "1 change wasn't saved online."
            : `${parked.count} changes weren't saved online.`}
        </Text>
        <BannerAction label="Retry" disabled={parked.busy} onPress={parked.retry} />
        <BannerAction label="Discard" disabled={parked.busy} onPress={parked.discard} />
      </View>
    );
  }
  if (reachable) {
    return null;
  }
  return (
    <View style={barStyle} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={palette.warning} />
      <Text style={styles.text}>
        Can't reach the server. Changes are saved on this phone and sync later.
        {Platform.OS === 'web' ? ' Using an ad blocker? Allow this site.' : ''}
      </Text>
    </View>
  );
}

function BannerAction(props: {
  label: string;
  disabled: boolean;
  onPress: () => Promise<void>;
}): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      hitSlop={6}
      onPress={() => void props.onPress()}
      style={({ pressed }) => [styles.action, (pressed || props.disabled) && styles.actionDimmed]}
    >
      <Text style={styles.actionText}>{props.label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      backgroundColor: c.bgElevated,
      borderBottomWidth: 1,
      borderBottomColor: c.warning,
    },
    text: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      lineHeight: 16,
      color: c.text,
    },
    action: {
      minHeight: 32,
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    actionDimmed: {
      opacity: 0.5,
    },
    actionText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.text,
      textDecorationLine: 'underline',
    },
  });
