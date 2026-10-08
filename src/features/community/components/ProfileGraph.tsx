import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { Completeness } from '@/features/community/services/profile-completeness';
import {
  openPlayStoreListing,
  profileDeepLink,
  shareProfile,
} from '@/features/community/services/share.service';
import { Button } from '@/features/home/components/Button';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

/** QR codes must stay dark-on-white in every theme so any camera can scan them. */
const QR_BACKGROUND = '#FFFFFF';
const QR_FOREGROUND = '#111111';

/** What the share button and QR code point at (defaults to this profile). */
export interface ProfileShareTarget {
  label: string;
  qrValue: string;
  qrHint: string;
  onShare: () => Promise<void>;
}

interface ProfileGraphProps {
  uid: string;
  displayName: string;
  completeness: Completeness;
  followerCount: number;
  followingCount: number;
  share?: ProfileShareTarget;
  /** Handler for the "Google backup" item (demo users link their Google account). */
  onLinkAccount?: () => void;
}

export function ProfileGraph({
  uid,
  displayName,
  completeness,
  followerCount,
  followingCount,
  share,
  onLinkAccount,
}: ProfileGraphProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const qrValue = share?.qrValue ?? profileDeepLink(uid);

  async function onShare(): Promise<void> {
    try {
      if (share) {
        await share.onShare();
      } else {
        await shareProfile(uid, displayName);
      }
    } catch (error) {
      notify.error('Could not share', toUserMessage(error));
    }
  }

  async function onRate(): Promise<void> {
    try {
      await openPlayStoreListing();
    } catch (error) {
      notify.error('Could not open Play Store', toUserMessage(error));
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.followRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${followerCount} followers`}
          style={({ pressed }) => [styles.followCell, pressed && styles.pressed]}
          onPress={() => router.push(`/(main)/follows?uid=${uid}&kind=followers`)}
        >
          <Text style={styles.followCount}>{followerCount}</Text>
          <Text style={styles.followLabel}>Followers</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Following ${followingCount}`}
          style={({ pressed }) => [styles.followCell, pressed && styles.pressed]}
          onPress={() => router.push(`/(main)/follows?uid=${uid}&kind=following`)}
        >
          <Text style={styles.followCount}>{followingCount}</Text>
          <Text style={styles.followLabel}>Following</Text>
        </Pressable>
      </View>

      <View style={styles.completeHead}>
        <Text style={typography.label}>Profile completeness</Text>
        <Text style={styles.percent}>{completeness.percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${completeness.percent}%` }]} />
      </View>
      {completeness.items
        .filter((item) => !item.done)
        .map((item) => (
          <Pressable
            key={item.id}
            disabled={!item.href && !(item.id === 'account' && onLinkAccount)}
            onPress={() => {
              if (item.href) {
                router.push(item.href as Href);
              } else if (item.id === 'account') {
                onLinkAccount?.();
              }
            }}
            style={({ pressed }) => [styles.todo, pressed && styles.pressed]}
          >
            <Text style={styles.todoLabel} numberOfLines={2}>
              {item.label}
            </Text>
            <View style={styles.todoAction}>
              <Text
                style={[
                  styles.todoHint,
                  !item.href && !(item.id === 'account' && onLinkAccount) && styles.todoPending,
                ]}
              >
                {item.href ? 'Add' : item.id === 'account' && onLinkAccount ? 'Link' : 'Pending'}
              </Text>
              {item.href || (item.id === 'account' && onLinkAccount) ? (
                <Ionicons name="chevron-forward" size={14} color={palette.primary} />
              ) : null}
            </View>
          </Pressable>
        ))}

      <View style={styles.qrCard}>
        <QRCode value={qrValue} size={140} backgroundColor={QR_BACKGROUND} color={QR_FOREGROUND} />
        <Text style={styles.qrHint}>{share?.qrHint ?? 'Scan to open this profile'}</Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={share?.label ?? 'Share profile'}
          icon="share-social-outline"
          variant="secondary"
          onPress={() => void onShare()}
        />
        {/* The store listing is Android-only (Play Store). */}
        {Platform.OS === 'android' ? (
          <Button
            label="Rate Snookit"
            icon="star-outline"
            variant="ghost"
            onPress={() => void onRate()}
          />
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    followRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    followCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      gap: 2,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    followCount: {
      fontFamily: fonts.bodyBold,
      fontSize: 20,
      color: c.text,
    },
    followLabel: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    completeHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    track: {
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: c.chartTrack,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: radii.pill,
    },
    percent: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 13,
    },
    todo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: TOUCH_TARGET,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    todoLabel: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.body,
      color: c.text,
      fontSize: 14,
    },
    todoAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    todoHint: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 12,
    },
    todoPending: {
      color: c.textFaint,
    },
    qrCard: {
      alignItems: 'center',
      alignSelf: 'center',
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: QR_BACKGROUND,
      marginTop: spacing.sm,
    },
    qrHint: {
      fontFamily: fonts.body,
      color: QR_FOREGROUND,
      fontSize: 12,
    },
    actions: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
  });
