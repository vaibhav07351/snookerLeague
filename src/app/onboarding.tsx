import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as leagueService from '@/features/league/services/league.service';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function OnboardingScreen(): ReactNode {
  const { user, refresh } = useSession();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [leagueName, setLeagueName] = useState('');
  const [raceTarget, setRaceTarget] = useState('50');
  const [bestOf, setBestOf] = useState('3');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!user) {
    return null;
  }

  const sessionUser = user;

  async function submit(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'create') {
        const name = leagueName.trim() || `${sessionUser.displayName}'s League`;
        await leagueService.createLeague({
          name,
          uid: sessionUser.uid,
          displayName: sessionUser.displayName,
          photoUrl: sessionUser.photoUrl,
          defaultRaceTarget: Number(raceTarget) || 50,
          defaultBestOf: Number(bestOf) || 3,
        });
      } else {
        if (code.trim().length < 4) {
          setError('Enter the 6-character invite code from a friend');
          setBusy(false);
          return;
        }
        await leagueService.joinLeague({
          code,
          uid: sessionUser.uid,
          displayName: sessionUser.displayName,
          photoUrl: sessionUser.photoUrl,
        });
      }
      await refresh();
      router.replace('/(main)');
    } catch (err) {
      Alert.alert('Could not continue', toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboardVerticalOffset={0}>
      <BrandLogo size={64} style={styles.logo} />
      <View style={styles.hero}>
        <Text style={typography.label}>Hey {sessionUser.displayName}</Text>
        <Text style={typography.title}>Set up your league</Text>
        <Text style={styles.sub}>
          A league is your friend group — shared scores, champions, and bragging rights.
        </Text>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => {
            setMode('create');
            setError(undefined);
          }}
          style={[styles.modeCard, mode === 'create' && styles.modeCardOn]}
        >
          <Text style={[styles.modeTitle, mode === 'create' && styles.modeTitleOn]}>Create</Text>
          <Text style={styles.modeBody}>Start a new group and invite friends with a code</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode('join');
            setError(undefined);
          }}
          style={[styles.modeCard, mode === 'join' && styles.modeCardOn]}
        >
          <Text style={[styles.modeTitle, mode === 'join' && styles.modeTitleOn]}>Join</Text>
          <Text style={styles.modeBody}>Already have a code from someone at the table?</Text>
        </Pressable>
      </View>

      {mode === 'create' ? (
        <>
          <TextField
            label="League name"
            value={leagueName}
            onChangeText={setLeagueName}
            placeholder={`${sessionUser.displayName}'s League`}
            autoCapitalize="words"
            hint="You can change this later in League settings"
          />
          <TextField
            label="Default race target"
            value={raceTarget}
            onChangeText={setRaceTarget}
            keyboardType="number-pad"
            hint="Points to win a race (e.g. 50)"
          />
          <TextField
            label="Default best-of"
            value={bestOf}
            onChangeText={setBestOf}
            keyboardType="number-pad"
            hint="Frames for a match (odd numbers work best: 3, 5, 7…)"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
        </>
      ) : (
        <TextField
          label="Invite code"
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(undefined);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="AB12CD"
          maxLength={8}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          error={error}
          hint="Ask a friend already in the league for their code"
        />
      )}

      <Button
        label={mode === 'create' ? 'Create my league' : 'Join league'}
        loading={busy}
        onPress={() => void submit()}
        disabled={busy}
      />

      <Text style={styles.footer}>
        Next up: add the people you play with, then log your first match or race.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  hero: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sub: {
    ...typography.subtitle,
    marginTop: spacing.xs,
  },
  modeRow: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modeCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  modeCardOn: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
  },
  modeTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.chalk,
  },
  modeTitleOn: {
    color: colors.goldSoft,
  },
  modeBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.chalkMuted,
  },
  footer: {
    marginTop: spacing.lg,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.chalkMuted,
    textAlign: 'center',
  },
});
