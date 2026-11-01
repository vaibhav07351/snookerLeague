import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGoogleSignIn } from '@/features/auth/hooks/use-google-sign-in';
import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { parseAndValidateDob } from '@/features/auth/services/division.service';
import * as profileService from '@/features/community/services/profile.service';
import { AgreeTerms } from '@/features/auth/components/AgreeTerms';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/shared/ui/Button';
import { DateOfBirthField } from '@/features/home/components/DateOfBirthField';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import { isCloudEnabled } from '@/shared/config/env';
import { useLayout } from '@/shared/hooks/use-layout';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

export default function LoginScreen(): ReactNode {
  const { refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { scale } = useLayout();
  const { ready: googleReady, promptIdToken } = useGoogleSignIn();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [dobError, setDobError] = useState<string | undefined>();
  const [agreed, setAgreed] = useState(false);
  // Google first; the local-only profile form is a second, opt-in step.
  const [step, setStep] = useState<'choose' | 'demo'>('choose');

  function needsAgreement(): boolean {
    if (agreed) {
      return false;
    }
    notify.info(
      'One quick step',
      'Tick the box to confirm you are 13 or older and accept the rules.',
    );
    return true;
  }

  async function onDemo(): Promise<void> {
    if (needsAgreement()) {
      return;
    }
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
      await authService.acceptTerms();
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
    if (needsAgreement()) {
      return;
    }
    if (!isCloudEnabled()) {
      notify.info(
        'Almost there',
        'Online sign-in is not set up in this build. Enter your name to play on this phone.',
      );
      setStep('demo');
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
      await authService.acceptTerms();
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

  if (step === 'demo') {
    return (
      <Screen keyboardVerticalOffset={0}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to sign-in options"
          hitSlop={8}
          onPress={() => setStep('choose')}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={20} color={palette.textMuted} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={typography.title}>Try without an account</Text>
        <Text style={[typography.subtitle, styles.demoNote]}>
          Everything stays on this phone. You can link Google later and keep it all.
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
          autoFocus
          returnKeyType="next"
          error={nameError}
        />
        <DateOfBirthField value={dob} onChange={setDob} error={dobError} />
        <Button
          label="Start playing"
          icon="arrow-forward"
          loading={busy}
          onPress={() => void onDemo()}
          disabled={busy}
          style={styles.demoButton}
        />
      </Screen>
    );
  }

  return (
    <Screen keyboardVerticalOffset={0}>
      <View style={styles.hero}>
        <BrandLogo size={scale(88)} style={styles.logo} />
        <BrandWordmark />
        <Text style={[typography.subtitle, styles.tagline]}>
          Live-score snooker with friends and see who rules the table in your city.
        </Text>
      </View>

      <View style={styles.actions}>
        <AgreeTerms checked={agreed} onChange={setAgreed} />
        <Button
          label="Continue with Google"
          icon="logo-google"
          onPress={() => void onGoogle()}
          disabled={busy || !googleReady}
          loading={busy}
        />
        <Text style={styles.googleNote}>Join friends&apos; leagues and sync across devices.</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            if (!needsAgreement()) {
              setStep('demo');
            }
          }}
          style={styles.demoLink}
        >
          <Text style={styles.demoLinkText}>Try without an account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hero: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    logo: {
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    tagline: {
      maxWidth: 320,
      textAlign: 'center',
    },
    actions: {
      gap: spacing.sm,
    },
    googleNote: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    demoLink: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    demoLinkText: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 15,
    },
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      minHeight: 40,
      marginBottom: spacing.sm,
    },
    backText: {
      fontFamily: fonts.bodyMedium,
      color: c.textMuted,
      fontSize: 15,
    },
    demoNote: {
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    demoButton: {
      marginTop: spacing.sm,
    },
  });
