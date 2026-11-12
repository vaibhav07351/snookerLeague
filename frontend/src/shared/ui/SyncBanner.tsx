import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useParkedWrites } from '@/shared/hooks/use-parked-writes';
import { isStoreReadOnly, subscribeStore } from '@/shared/storage/local-store';
import { isCloudReachable, subscribeCloudReachable } from '@/shared/sync/sync-status';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

/**
 * How long changes may wait while the server is reachable before the banner mentions them.
 * Every tap queues a change that normally goes up within seconds; only a stuck queue shows.
 */
const STUCK_AFTER_MS = 15_000;

/** "1 change", "3 changes". */
function changes(n: number): string {
  return n === 1 ? '1 change' : `${n} changes`;
}

/** True once `count` has stayed above zero for `ms` without a break. */
function useStuck(count: number, ms: number): boolean {
  const [stuck, setStuck] = useState(false);
  const waiting = count > 0;
  useEffect(() => {
    setStuck(false);
    if (!waiting) {
      return undefined;
    }
    const timer = setTimeout(() => setStuck(true), ms);
    return () => clearTimeout(timer);
  }, [waiting, ms]);
  return stuck;
}

/**
 * Slim notice at the top of the app, most serious first: this phone's saved data could not be
 * read (saving is paused), changes the server would not take (with Retry and Discard), the
 * server cannot be reached (everything keeps working locally; says how many changes wait),
 * or changes that have been waiting a while (with Sync now).
 */
export function SyncBanner(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [reachable, setReachable] = useState(isCloudReachable());
  const [readOnly, setReadOnly] = useState(isStoreReadOnly());
  const parked = useParkedWrites();
  const stuck = useStuck(reachable ? parked.waiting : 0, STUCK_AFTER_MS);

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
    if (!stuck || parked.waiting === 0) {
      return null;
    }
    return (
      <View style={barStyle} accessibilityRole="alert">
        <Ionicons name="sync-outline" size={16} color={palette.warning} />
        <Text style={styles.text}>{changes(parked.waiting)} waiting to sync.</Text>
        <BannerAction label="Sync now" disabled={parked.busy} onPress={parked.syncNow} />
      </View>
    );
  }
  return (
    <View style={barStyle} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color={palette.warning} />
      <Text style={styles.text}>
        {parked.waiting > 0
          ? `Offline. ${changes(parked.waiting)} saved on this phone, waiting to sync.`
          : "Can't reach the server. Changes are saved on this phone and sync later."}
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
      fontSize: typeScale.caption,
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
      fontSize: typeScale.small,
      color: c.text,
      textDecorationLine: 'underline',
    },
  });
