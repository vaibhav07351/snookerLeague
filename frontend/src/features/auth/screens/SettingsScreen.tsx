import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLinkGoogle } from '@/features/auth/hooks/use-link-google';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { divisionFromDob, divisionLabel } from '@/features/auth/services/division.service';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { useTour } from '@/features/tour/hooks/use-tour';
import * as tourService from '@/features/tour/services/tour.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { resetHints } from '@/shared/hooks/use-hint';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';
import { describeAppearance } from '@/theme/theme-preference';
import { usePalette, useStyles, useTheme } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Account, leagues and app preferences: everything that used to make Profile scroll. */
export function SettingsScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const { mode, darkThemeId } = useTheme();
  const { user, league, refresh } = useSession();
  const linkGoogle = useLinkGoogle();
  const tour = useTour();

  async function onReplayTour(): Promise<void> {
    try {
      await Promise.all([tourService.resetTours(), resetHints()]);
      tour.requestReplay();
      // Home greets with the welcome story next time it is on screen.
      router.dismissAll();
      router.navigate('/(main)/(tabs)');
    } catch (error) {
      notify.error('Could not restart the tour', toUserMessage(error));
    }
  }

  async function onSignOut(): Promise<void> {
    const ok = await confirmAction('Log out?', 'You can sign back in anytime.', 'Log out');
    if (!ok) {
      return;
    }
    try {
      await authService.signOut();
      await refresh();
      router.replace('/login');
    } catch (error) {
      notify.error('Could not log out', toUserMessage(error));
    }
  }

  async function onDeleteAccount(): Promise<void> {
    const what = user?.isDemo
      ? 'Everything on this phone (leagues, matches, players) is deleted.'
      : 'Your account, profile, posts and the leagues you own are deleted for everyone. In other leagues your player card becomes "Deleted player" so their scores stay correct.';
    const ok = await confirmAction(
      'Delete your account?',
      `${what} This can't be undone.`,
      'Continue',
    );
    if (!ok) {
      return;
    }
    const sure = await confirmAction(
      'Are you sure?',
      'Last check: delete everything now?',
      'Delete',
    );
    if (!sure) {
      return;
    }
    try {
      await authService.deleteAccount();
      await refresh();
      router.replace('/login');
      notify.success('Account deleted', 'Your data has been removed.');
    } catch (error) {
      notify.error('Could not delete your account', toUserMessage(error));
    }
  }

  if (!user) {
    return null;
  }

  return (
    <Screen>
      <Card style={styles.account}>
        <View style={styles.accountHead}>
          <View style={styles.accountText}>
            <Text style={typography.heading} numberOfLines={1}>
              {user.displayName}
            </Text>
            {user.email ? (
              <Text style={styles.meta} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Text style={styles.badge}>{user.isDemo ? 'Local' : 'Google'}</Text>
        </View>
        {linkGoogle.available ? (
          <>
            <Text style={styles.meta}>Link Google to keep this data and sync it to the cloud.</Text>
            <Button
              label="Continue with Google"
              variant="secondary"
              size="sm"
              loading={linkGoogle.linking}
              disabled={linkGoogle.linking}
              onPress={() => void linkGoogle.link()}
            />
          </>
        ) : null}
      </Card>

      <View style={styles.group}>
        <SettingsRow
          icon="trophy-outline"
          label="League"
          value={league?.name ?? 'None'}
          onPress={() => router.push('/(main)/league')}
        />
        <SettingsRow
          icon="location-outline"
          label="City"
          value={user.cityId ? (user.cityName ?? 'Set') : 'Choose'}
          onPress={() => router.push('/location')}
        />
        <SettingsRow
          icon="calendar-outline"
          label="Division"
          value={
            user.dateOfBirth
              ? divisionLabel(divisionFromDob(user.dateOfBirth))
              : 'Add date of birth'
          }
          onPress={() => router.push('/birthday')}
        />
        <SettingsRow
          icon="color-palette-outline"
          label="Appearance"
          value={describeAppearance({ mode, darkThemeId })}
          onPress={() => router.push('/settings/theme')}
        />
        <SettingsRow
          icon="compass-outline"
          label="Replay app tour"
          onPress={() => void onReplayTour()}
          last
        />
      </View>

      <Button label="Log out" variant="danger" onPress={() => void onSignOut()} />
      <Button
        label="Delete account"
        variant="ghost"
        icon="trash-outline"
        style={styles.delete}
        onPress={() => void onDeleteAccount()}
      />
    </Screen>
  );
}

interface SettingsRowProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}

function SettingsRow({ icon, label, value, onPress, last = false }: SettingsRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={palette.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        <View style={styles.flex} />
      )}
      <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    account: {
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    accountHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    accountText: {
      flex: 1,
      minWidth: 0,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    badge: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.onPrimary,
      backgroundColor: c.success,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    group: {
      marginBottom: spacing.lg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 52,
      paddingHorizontal: spacing.md,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    rowLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.text,
    },
    rowValue: {
      flex: 1,
      minWidth: 0,
      textAlign: 'right',
      fontFamily: fonts.body,
      fontSize: 14,
      color: c.textMuted,
    },
    flex: {
      flex: 1,
    },
    delete: {
      marginTop: spacing.md,
    },
  });
