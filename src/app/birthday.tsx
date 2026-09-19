import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { parseAndValidateDob } from '@/features/auth/services/division.service';
import * as profileService from '@/features/community/services/profile.service';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/features/home/components/Button';
import { DateOfBirthField } from '@/features/home/components/DateOfBirthField';
import { Screen } from '@/features/home/components/Screen';
import { toUserMessage } from '@/shared/errors/app-error';
import { colors, spacing, typography } from '@/theme/tokens';

export default function BirthdayScreen(): ReactNode {
  const { user, refresh } = useSession();
  const [dob, setDob] = useState(user?.dateOfBirth ?? '');
  const [dobError, setDobError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    try {
      parseAndValidateDob(dob);
      setDobError(undefined);
    } catch (error) {
      setDobError(toUserMessage(error));
      return;
    }
    setBusy(true);
    try {
      await profileService.setOwnDateOfBirth(dob);
      await refresh();
      router.replace('/');
    } catch (error) {
      Alert.alert('Could not save date of birth', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandWordmark size="md" />
      <Text style={[typography.title, styles.title]}>When were you born?</Text>
      <Text style={styles.sub}>
        Snooker tables are split by age: Under 16, Under 18, Under 21, Open, Masters 40+, and
        Seniors 50+. We keep the date on your account and only show the division publicly.
      </Text>
      <DateOfBirthField value={dob} onChange={setDob} error={dobError} />
      <Button label="Continue" loading={busy} disabled={busy} onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
  },
  sub: {
    ...typography.subtitle,
    marginBottom: spacing.lg,
    color: colors.chalkMuted,
  },
});
