import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { Button } from '@/features/home/components/Button';
import { SignOutLink } from '@/features/auth/components/SignOutLink';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** First league: create one, or join a friend's with an invite code. */
export default function OnboardingScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { user, refresh } = useSession();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [leagueName, setLeagueName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!user) {
    return null;
  }
  const sessionUser = user;

  async function create(): Promise<void> {
    setBusy(true);
    try {
      await leagueService.createLeague({
        name: leagueName.trim() || `${sessionUser.displayName}'s League`,
        uid: sessionUser.uid,
        displayName: sessionUser.displayName,
        photoUrl: sessionUser.photoUrl,
      });
      await refresh();
      router.replace('/(main)');
    } catch (err) {
      notify.error('Could not create the league', toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function goJoin(): void {
    try {
      const normalized = leagueService.normalizeInviteCode(code);
      setError(undefined);
      router.push({ pathname: '/join/[code]', params: { code: normalized } });
    } catch (err) {
      setError(toUserMessage(err));
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <BrandLogo size={56} />
        <Text style={typography.label}>Welcome, {sessionUser.displayName}</Text>
        <Text style={typography.title}>Set up your league</Text>
        <Text style={typography.subtitle}>
          A league is your group of friends: shared scores, live matches, champions and bragging
          rights.
        </Text>
      </View>

      <View style={styles.modeRow}>
        <ModeCard
          icon="add-circle-outline"
          title="Create a league"
          body="Start fresh and invite friends with a link"
          selected={mode === 'create'}
          onPress={() => {
            setMode('create');
            setError(undefined);
          }}
        />
        <ModeCard
          icon="enter-outline"
          title="Join a league"
          body="A friend sent you a code or link"
          selected={mode === 'join'}
          onPress={() => {
            setMode('join');
            setError(undefined);
          }}
        />
      </View>

      {mode === 'create' ? (
        <>
          <TextField
            label="League name"
            value={leagueName}
            onChangeText={setLeagueName}
            placeholder={`${sessionUser.displayName}'s League`}
            autoCapitalize="words"
            maxLength={40}
            hint="You can rename it later in League settings."
          />
          <Button
            label="Create league"
            icon="trophy-outline"
            loading={busy}
            onPress={() => void create()}
          />
        </>
      ) : (
        <>
          <TextField
            label="Invite code"
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            placeholder="e.g. K7Q2MX"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            error={error}
            hint="Got a link instead? Just tap it: it opens this app's join screen."
            onSubmitEditing={goJoin}
            returnKeyType="go"
          />
          <Button label="Continue" icon="arrow-forward" onPress={goJoin} />
          {sessionUser.isDemo ? (
            <Text style={[styles.note, { color: palette.warning }]}>
              Joining a friend's league needs Google sign-in (demo mode stays on this phone).
            </Text>
          ) : null}
        </>
      )}
      <SignOutLink />
    </Screen>
  );
}

function ModeCard({
  icon,
  title,
  body,
  selected,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.modeCard, selected && styles.modeCardOn]}
    >
      <Ionicons name={icon} size={24} color={selected ? palette.primary : palette.textMuted} />
      <Text style={[styles.modeTitle, selected && { color: palette.primary }]}>{title}</Text>
      <Text style={styles.modeBody}>{body}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    hero: {
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: spacing.lg,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    modeCard: {
      flex: 1,
      minWidth: 0,
      gap: 6,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    modeCardOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    modeTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    modeBody: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    note: {
      marginTop: spacing.md,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
  });
