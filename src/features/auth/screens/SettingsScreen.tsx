import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLinkGoogle } from '@/features/auth/hooks/use-link-google';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { divisionFromDob, divisionLabel } from '@/features/auth/services/division.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { LeagueSwitchList } from '@/features/league/components/LeagueSwitchList';
import { toUserMessage } from '@/shared/errors/app-error';
import { resetHints } from '@/shared/hooks/use-hint';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { confirmAction } from '@/shared/utils/confirm';
import { PALETTES } from '@/theme/palettes';
import { useStyles, useTheme } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Account, leagues and app preferences: everything that used to make Profile scroll. */
export function SettingsScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const { themeId } = useTheme();
  const { user, refresh } = useSession();
  const linkGoogle = useLinkGoogle();

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

  if (!user) {
    return null;
  }

  return (
    <Screen>
      <Card style={styles.account}>
        <Text style={typography.heading}>{user.displayName}</Text>
        {user.email ? <Text style={styles.meta}>{user.email}</Text> : null}
        <Text style={styles.badge}>{user.isDemo ? 'Local profile' : 'Google account'}</Text>
        {linkGoogle.available ? (
          <>
            <Text style={styles.meta}>
              You started with a local name. Link Google to keep this data and sync it to the cloud.
            </Text>
            <Button
              label="Continue with Google"
              variant="secondary"
              loading={linkGoogle.linking}
              disabled={linkGoogle.linking}
              onPress={() => void linkGoogle.link()}
            />
          </>
        ) : null}
      </Card>

      <SectionTitle
        title="Your leagues"
        actionLabel="Manage"
        onAction={() => router.push('/(main)/league')}
      />
      <Text style={styles.hint}>
        Tap a league to switch. Home, players and stats follow the active league.
      </Text>
      <LeagueSwitchList onSwitched={() => router.dismissTo('/(main)')} />

      <SectionTitle title="Profile" />
      <View style={styles.group}>
        <Button
          label={user.cityId ? `City: ${user.cityName ?? 'set'}` : 'Choose city'}
          variant="ghost"
          icon="location-outline"
          onPress={() => router.push('/location')}
        />
        <Button
          label={
            user.dateOfBirth
              ? `Division: ${divisionLabel(divisionFromDob(user.dateOfBirth))}`
              : 'Add date of birth'
          }
          variant="ghost"
          icon="calendar-outline"
          onPress={() => router.push('/birthday')}
        />
      </View>

      <SectionTitle title="App" />
      <View style={styles.group}>
        <Button
          label={`Appearance: ${PALETTES[themeId].name}`}
          variant="ghost"
          icon="color-palette-outline"
          onPress={() => router.push('/settings/theme')}
        />
        <Button
          label="Show tips again"
          variant="ghost"
          icon="bulb-outline"
          onPress={() => {
            void resetHints().then(() =>
              notify.success('Tips are back', 'You will see them again.'),
            );
          }}
        />
      </View>

      <Button label="Log out" variant="danger" onPress={() => void onSignOut()} />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    account: {
      marginBottom: spacing.lg,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    badge: {
      alignSelf: 'flex-start',
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.onPrimary,
      backgroundColor: c.success,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    group: {
      marginBottom: spacing.lg,
    },
  });
