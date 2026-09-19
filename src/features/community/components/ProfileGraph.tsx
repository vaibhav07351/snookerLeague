import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { Completeness } from '@/features/community/services/profile-completeness';
import {
  openPlayStoreListing,
  profileDeepLink,
  shareProfile,
} from '@/features/community/services/share.service';
import { Button } from '@/features/home/components/Button';
import { toUserMessage } from '@/shared/errors/app-error';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

interface ProfileGraphProps {
  uid: string;
  displayName: string;
  completeness: Completeness;
  followerCount: number;
  followingCount: number;
}

export function ProfileGraph({
  uid,
  displayName,
  completeness,
  followerCount,
  followingCount,
}: ProfileGraphProps): ReactNode {
  const qrValue = profileDeepLink(uid);

  async function onShare(): Promise<void> {
    try {
      await shareProfile(uid, displayName);
    } catch (error) {
      Alert.alert('Could not share', toUserMessage(error));
    }
  }

  async function onRate(): Promise<void> {
    try {
      await openPlayStoreListing();
    } catch (error) {
      Alert.alert('Could not open Play Store', toUserMessage(error));
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.followRow}>
        <Pressable
          style={styles.followCell}
          onPress={() => router.push(`/(main)/follows?uid=${uid}&kind=followers`)}
        >
          <Text style={styles.followCount}>{followerCount}</Text>
          <Text style={styles.followLabel}>Followers</Text>
        </Pressable>
        <Pressable
          style={styles.followCell}
          onPress={() => router.push(`/(main)/follows?uid=${uid}&kind=following`)}
        >
          <Text style={styles.followCount}>{followingCount}</Text>
          <Text style={styles.followLabel}>Following</Text>
        </Pressable>
      </View>

      <Text style={typography.label}>Profile completeness</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${completeness.percent}%` }]} />
      </View>
      <Text style={styles.percent}>{completeness.percent}%</Text>
      {completeness.items
        .filter((item) => !item.done)
        .map((item) => (
          <Pressable
            key={item.id}
            disabled={!item.href}
            onPress={() => {
              if (item.href) {
                router.push(item.href as Href);
              }
            }}
            style={styles.todo}
          >
            <Text style={styles.todoLabel}>{item.label}</Text>
            <Text style={styles.todoHint}>{item.href ? 'Add' : 'Pending'}</Text>
          </Pressable>
        ))}

      <View style={styles.qrCard}>
        <QRCode value={qrValue} size={140} backgroundColor={colors.white} color={colors.felt} />
        <Text style={styles.qrHint}>Scan to open this profile</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Share profile" variant="secondary" onPress={() => void onShare()} />
        <Button label="Rate Snookit" variant="ghost" onPress={() => void onRate()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  followCount: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.goldSoft,
  },
  followLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.chartTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
  },
  percent: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalkMuted,
    fontSize: 13,
  },
  todo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  todoLabel: {
    fontFamily: fonts.body,
    color: colors.chalk,
    fontSize: 14,
  },
  todoHint: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 12,
  },
  qrCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    marginTop: spacing.sm,
  },
  qrHint: {
    fontFamily: fonts.body,
    color: colors.felt,
    fontSize: 12,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
