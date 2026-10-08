import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLinkGoogle } from '@/features/auth/hooks/use-link-google';
import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { useJoinLeague } from '@/features/league/hooks/use-join-league';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Leave the join flow for good: clear the stack so back never returns to it or onboarding. */
function leaveTo(href: '/' | '/(main)'): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(href);
}

/** Opened from an invite link (https://.../join/CODE) or a typed code. */
export default function JoinLeagueScreen(): ReactNode {
  const { code } = useLocalSearchParams<{ code: string }>();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { user } = useSession();
  const { step, busy, join, claim, createOwn, retry } = useJoinLeague(code);
  const linkGoogle = useLinkGoogle();
  const [choice, setChoice] = useState<string | 'new' | null>(null);
  const [name, setName] = useState(user?.displayName ?? '');

  // Signed out or setup unfinished: the invite is saved; the start gate brings them back.
  useEffect(() => {
    if (step.kind === 'needs-setup') {
      router.replace(user ? '/' : '/login');
    }
  }, [step.kind, user]);

  useEffect(() => {
    if (step.kind === 'pick-player' && choice == null) {
      setChoice(step.guests.length === 0 ? 'new' : null);
    }
  }, [step, choice]);

  if (step.kind === 'loading' || step.kind === 'needs-setup') {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
          <Text style={typography.subtitle}>Checking your invite</Text>
        </View>
      </Screen>
    );
  }

  if (step.kind === 'needs-account') {
    return (
      <Screen>
        <EmptyState
          icon="logo-google"
          title="Sign in with Google to join"
          message={`${step.message} Link Google now: your scores so far come with you, and this invite opens again straight after.`}
        />
        {linkGoogle.available ? (
          <Button
            label="Link Google account"
            icon="logo-google"
            loading={linkGoogle.linking}
            onPress={() => void linkGoogle.link()}
            style={styles.confirm}
          />
        ) : null}
        <Button
          label="Not now"
          variant="ghost"
          onPress={() => leaveTo('/')}
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  if (step.kind === 'error') {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Could not join"
          message={step.message}
          actionLabel={step.retryable ? 'Try again' : 'Go home'}
          onAction={step.retryable ? retry : () => leaveTo('/')}
        />
      </Screen>
    );
  }

  if (step.kind === 'done') {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={32} color={palette.onPrimary} />
          </View>
          <Text style={[typography.title, styles.centerText]}>You are in {step.leagueName}</Text>
          <Text style={[typography.subtitle, styles.centerText]}>
            Start a match, or watch your friends score live from Home.
          </Text>
          <Button
            label="Open the league"
            icon="arrow-forward"
            onPress={() => leaveTo('/(main)')}
            style={styles.wide}
          />
        </View>
      </Screen>
    );
  }

  if (step.kind === 'joinable') {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={styles.badge}>
            <Ionicons name="people" size={28} color={palette.onPrimary} />
          </View>
          <Text style={typography.label}>You are invited to</Text>
          <Text style={[typography.title, styles.centerText]}>{step.leagueName}</Text>
          <Text style={[typography.subtitle, styles.centerText]}>
            Join to score matches together, follow games live and climb the league table.
          </Text>
          <Button
            label="Join league"
            icon="enter-outline"
            loading={busy}
            onPress={() => void join()}
            style={styles.wide}
          />
          <Button
            label="Not now"
            variant="ghost"
            onPress={() => leaveTo('/')}
            style={styles.wide}
          />
        </View>
      </Screen>
    );
  }

  // pick-player
  const guests = step.guests;
  async function confirm(): Promise<void> {
    try {
      if (choice === 'new') {
        await createOwn(name);
      } else if (choice) {
        await claim(choice);
      }
    } catch (error) {
      // The list was reloaded (e.g. someone claimed that card first): choose again.
      setChoice(null);
      notify.error('Could not save your player', toUserMessage(error));
    }
  }

  return (
    <Screen>
      <Text style={typography.title}>Which player are you?</Text>
      <Text style={[typography.subtitle, styles.intro]}>
        {guests.length > 0
          ? `If someone already added you to ${step.leagueName}, pick your name to keep your match history. Otherwise add yourself.`
          : `Add yourself to ${step.leagueName}. You can change your name later.`}
      </Text>

      {guests.length > 0 ? (
        <>
          <SectionTitle title="Already on the roster" />
          <View style={styles.list}>
            {guests.map((g) => (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: choice === g.id }}
                onPress={() => setChoice(g.id)}
                style={[styles.option, choice === g.id && styles.optionOn]}
              >
                <Ionicons
                  name={choice === g.id ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={choice === g.id ? palette.primary : palette.textMuted}
                />
                <View style={styles.optionText}>
                  <Text style={styles.optionName} numberOfLines={1}>
                    {g.displayName}
                  </Text>
                  <Text style={styles.optionMeta}>
                    {g.stats.standard.played > 0
                      ? `${g.stats.standard.played} matches played`
                      : 'No matches yet'}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle title={guests.length > 0 ? 'Not on the list?' : 'Your name'} />
      <Card tone={choice === 'new' ? 'highlight' : 'default'}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: choice === 'new' }}
          onPress={() => setChoice('new')}
          style={styles.newRow}
        >
          <Ionicons
            name={choice === 'new' ? 'radio-button-on' : 'radio-button-off'}
            size={20}
            color={choice === 'new' ? palette.primary : palette.textMuted}
          />
          <Text style={styles.optionName}>I am new here</Text>
        </Pressable>
        {choice === 'new' ? (
          <TextField
            label="Name shown to the league"
            value={name}
            onChangeText={setName}
            maxLength={40}
            autoCapitalize="words"
            hint="First name and surname helps when two players share a first name."
          />
        ) : null}
      </Card>

      <Button
        label={choice === 'new' ? 'Add me to the league' : 'That is me'}
        loading={busy}
        disabled={busy || choice == null || (choice === 'new' && name.trim().length < 2)}
        onPress={() => void confirm()}
        style={styles.confirm}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xl,
    },
    centerText: {
      textAlign: 'center',
    },
    badge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wide: {
      alignSelf: 'stretch',
    },
    intro: {
      marginTop: spacing.xs,
    },
    list: {
      gap: spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    optionOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    optionText: {
      flex: 1,
      minWidth: 0,
    },
    optionName: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    optionMeta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    newRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 40,
    },
    confirm: {
      marginTop: spacing.lg,
    },
    gapTop: {
      marginTop: spacing.sm,
    },
  });
