import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isStoreReadOnly, subscribeStore } from '@/shared/storage/local-store';
import { isCloudReachable, subscribeCloudReachable } from '@/shared/sync/sync-status';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

/**
 * Slim notice while the server cannot be reached (everything keeps working locally), or,
 * more seriously, when this phone's saved data could not be read and saving is paused.
 */
export function SyncBanner(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [reachable, setReachable] = useState(isCloudReachable());

  const [readOnly, setReadOnly] = useState(isStoreReadOnly());

  useEffect(() => subscribeCloudReachable(setReachable), []);
  useEffect(() => subscribeStore(() => setReadOnly(isStoreReadOnly())), []);

  if (readOnly) {
    return (
      <View style={[styles.bar, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
        <Ionicons name="warning-outline" size={16} color={palette.warning} />
        <Text style={styles.text}>
          Saved data on this phone could not be read, so saving is paused to protect it. Restart the
          app; if this keeps showing, contact support before reinstalling.
        </Text>
      </View>
    );
  }
  if (reachable) {
    return null;
  }
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={palette.warning} />
      <Text style={styles.text}>
        Can't reach the server. Changes are saved on this phone and sync later.
        {Platform.OS === 'web' ? ' Using an ad blocker? Allow this site.' : ''}
      </Text>
    </View>
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
  });
