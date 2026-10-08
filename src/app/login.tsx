import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useGoogleSignIn } from '@/features/auth/hooks/use-google-sign-in';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { parseAndValidateDob } from '@/features/auth/services/division.service';
import * as profileService from '@/features/community/services/profile.service';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/features/home/components/Button';
import { DateOfBirthField } from '@/features/home/components/DateOfBirthField';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import { isFirebaseEnabled } from '@/shared/firebase/app';
import { useLayout } from '@/shared/hooks/use-layout';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

export default function LoginScreen(): ReactNode {
  const { refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const { scale } = useLayout();
  const { ready: googleReady, promptIdToken } = useGoogleSignIn();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [dobError, setDobError] = useState<string | undefined>();

  async function onDemo(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Enter your name (at least 2 letters)');
      return;
    }
    setNameError(undefined);
    let dateOfBirth: string;
    try {
      dateOfBirth = parseAndValidateDob(dob);
      setDobError(undefined);
    } catch (error) {
      setDobError(toUserMessage(error));
      return;
    }
    setBusy(true);
    try {
      await authService.signInDemo(trimmed, dateOfBirth);
      await profileService.setOwnDateOfBirth(dateOfBirth);
      await refresh();
      router.replace('/');
    } catch (error) {
      notify.error('Could not sign in', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(): Promise<void> {
    if (!isFirebaseEnabled()) {
      notify.info(
        'Almost there',
        'Cloud sign-in needs a one-time Firebase setup. For now, enter your name below and tap Try without an account: everything works on this phone.',
      );
      return;
    }
    if (!googleReady) {
      notify.error(
        'Google sign-in failed',
        'Auth request is still loading. Try again in a moment.',
      );
      return;
    }
    try {
      // Do not set busy before the account picker: Android Google Sign-In
      // fails when another modal/loading state is already on screen.
      const idToken = await promptIdToken();
      if (!idToken) {
        return;
      }
      setBusy(true);
      await authService.signInWithGoogleIdToken(idToken);
      if (dob.trim()) {
        try {
          await profileService.setOwnDateOfBirth(parseAndValidateDob(dob));
        } catch {
          // Birthday onboarding collects a valid date after Google returns.
        }
      }
      await refresh();
      router.replace('/');
    } catch (error) {
      notify.error('Google sign-in failed', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboardVerticalOffset={0}>
      <View style={styles.hero}>
        <BrandLogo size={scale(96)} style={styles.logo} />
        <Text style={typography.label}>Your table. Your city.</Text>
        <BrandWordmark />
        <Text style={[typography.subtitle, styles.tagline]}>
          Live-score snooker with your friends and see who rules the table in your city.
        </Text>
      </View>

      <Card tone="highlight" style={styles.googleCard}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Recommended</Text>
        </View>
        <Button
          label="Continue with Google"
          icon="logo-google"
          onPress={() => void onGoogle()}
          disabled={busy || !googleReady}
        />
        <Text style={styles.googleNote}>
          Needed to join your friends&apos; leagues and keep your scores synced across devices.
        </Text>
      </Card>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.demo}>
        <Text style={typography.heading}>Try without an account</Text>
        <Text style={[typography.caption, styles.demoNote]}>
          Demo mode: everything stays on this device only.
        </Text>
        <TextField
          label="What should we call you?"
          value={name}
          onChangeText={(t) => {
            setName(t);
            if (nameError) {
              setNameError(undefined);
            }
          }}
          placeholder="Your name"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void onDemo()}
          error={nameError}
          hint="This is how you appear on the leaderboard"
        />
        <DateOfBirthField value={dob} onChange={setDob} error={dobError} />
        <Button
          label="Try without an account"
          variant="secondary"
          loading={busy}
          onPress={() => void onDemo()}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hero: {
      marginTop: spacing.md,
      marginBottom: spacing.lg,
      gap: spacing.sm,
      alignItems: 'flex-start',
    },
    logo: {
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    tagline: {
      maxWidth: 360,
    },
    googleCard: {
      gap: spacing.sm,
      padding: spacing.md,
    },
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: c.primary,
    },
    badgeText: {
      fontFamily: fonts.bodyBold,
      color: c.onPrimary,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    googleNote: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginVertical: spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: c.border,
    },
    dividerText: {
      fontFamily: fonts.bodyMedium,
      color: c.textFaint,
      fontSize: 13,
    },
    demo: {
      gap: spacing.xs,
    },
    demoNote: {
      marginBottom: spacing.md,
    },
  });
