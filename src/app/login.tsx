import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

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
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function LoginScreen(): ReactNode {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [dobError, setDobError] = useState<string | undefined>();
  const [request, response, promptAsync] = authService.useGoogleAuthRequest();
  const handledIdToken = useRef<string | null>(null);

  async function completeGoogleWithResult(
    result: Parameters<typeof authService.extractGoogleIdToken>[0],
  ): Promise<void> {
    if (!result) {
      return;
    }
    if (result.type === 'dismiss' || result.type === 'cancel') {
      return;
    }
    if (result.type !== 'success') {
      Alert.alert('Google sign-in failed', 'Something went wrong. Please try again.');
      return;
    }
    const idToken = authService.extractGoogleIdToken(result);
    if (!idToken) {
      Alert.alert(
        'Google sign-in failed',
        'Google did not return an ID token. Check that the Web client ID matches Firebase Authentication → Google.',
      );
      return;
    }
    if (handledIdToken.current === idToken) {
      return;
    }
    handledIdToken.current = idToken;
    setBusy(true);
    try {
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
      handledIdToken.current = null;
      Alert.alert('Google sign-in failed', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void completeGoogleWithResult(response);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when auth response changes
  }, [response]);

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
      Alert.alert('Could not sign in', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(): Promise<void> {
    if (!isFirebaseEnabled()) {
      Alert.alert(
        'Almost there',
        'Cloud sign-in needs a one-time Firebase setup. For now, enter your name above and tap Get started — everything works on this phone.',
      );
      return;
    }
    if (!request) {
      Alert.alert('Google sign-in failed', 'Auth request is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    try {
      const result = await promptAsync();
      await completeGoogleWithResult(result);
    } catch (error) {
      Alert.alert('Google sign-in failed', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboardVerticalOffset={0}>
      <View style={styles.hero}>
        <BrandLogo size={112} style={styles.logo} />
        <Text style={typography.label}>Your table. Your city.</Text>
        <BrandWordmark />
        <Text style={styles.tagline}>
          Live score every shot, find the best players in your city, and crown who rules the table.
        </Text>
      </View>

      <View style={styles.steps}>
        {[
          { n: '1', t: 'Tell us your name and date of birth' },
          { n: '2', t: 'Pick your city' },
          { n: '3', t: 'Live-score matches & races' },
        ].map((step) => (
          <View key={step.n} style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepNum}>{step.n}</Text>
            </View>
            <Text style={styles.stepText}>{step.t}</Text>
          </View>
        ))}
      </View>

      <View style={styles.form}>
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
        <Button label="Get started" loading={busy} onPress={() => void onDemo()} disabled={busy} />
        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => void onGoogle()}
          disabled={busy}
          style={styles.google}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  logo: {
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tagline: {
    ...typography.subtitle,
    maxWidth: 340,
    marginTop: spacing.xs,
  },
  steps: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 13,
  },
  stepText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
    fontSize: 15,
  },
  form: {
    marginTop: 'auto',
  },
  google: {
    marginTop: spacing.sm,
  },
});
