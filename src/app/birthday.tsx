import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { parseAndValidateDob } from '@/features/auth/services/division.service';
import * as profileService from '@/features/community/services/profile.service';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { Button } from '@/features/home/components/Button';
import { DateOfBirthField } from '@/features/home/components/DateOfBirthField';
import { SignOutLink } from '@/features/auth/components/SignOutLink';
import { Screen } from '@/features/home/components/Screen';
import { toUserMessage } from '@/shared/errors/app-error';
import { useSafeBack } from '@/shared/ui/HeaderBack';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

const DIVISIONS = ['Under 16', 'Under 18', 'Under 21', 'Open', 'Masters 40+', 'Seniors 50+'];

export default function BirthdayScreen(): ReactNode {
  const { user, refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const goBack = useSafeBack('/(main)/profile');
  const [dob, setDob] = useState(user?.dateOfBirth ?? '');
  const [dobError, setDobError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // Already has a birthday: this screen was opened to edit it, so offer a way back.
  const isEditing = Boolean(user?.dateOfBirth);

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
      if (isEditing) {
        notify.success('Date of birth updated');
        goBack();
        return;
      }
      router.replace('/');
    } catch (error) {
      notify.error('Could not save date of birth', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {isEditing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
          hitSlop={8}
          onPress={goBack}
          disabled={busy}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={palette.text} />
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
      ) : (
        <BrandWordmark size="md" />
      )}
      <Text style={[typography.title, styles.title]}>
        {isEditing ? 'Update your date of birth' : 'When were you born?'}
      </Text>
      <Text style={[typography.subtitle, styles.sub]}>
        Snooker tables are split by age. We keep the date on your account and only show your
        division publicly.
      </Text>
      <View style={styles.divisions}>
        {DIVISIONS.map((d) => (
          <View key={d} style={styles.division}>
            <Text style={styles.divisionText}>{d}</Text>
          </View>
        ))}
      </View>
      <DateOfBirthField value={dob} onChange={setDob} error={dobError} />
      <Button
        label={isEditing ? 'Save' : 'Continue'}
        loading={busy}
        disabled={busy}
        onPress={() => void save()}
      />
      {!isEditing ? <SignOutLink /> : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    back: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: TOUCH_TARGET,
      paddingRight: spacing.sm,
      marginLeft: -6,
      gap: 2,
    },
    backText: {
      fontFamily: fonts.bodyMedium,
      color: c.text,
      fontSize: 16,
    },
    pressed: {
      opacity: 0.7,
    },
    title: {
      marginTop: spacing.md,
    },
    sub: {
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    divisions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: spacing.lg,
    },
    division: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    divisionText: {
      fontFamily: fonts.bodyMedium,
      color: c.textMuted,
      fontSize: 12,
    },
  });
