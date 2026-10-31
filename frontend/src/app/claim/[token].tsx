import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { redeemClaimLink } from '@/features/players/services/claim-link.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { LoadingState } from '@/shared/ui/LoadingState';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { makeTypography, spacing, type Palette } from '@/theme/tokens';

type State = { kind: 'working' } | { kind: 'needs-sign-in' } | { kind: 'failed'; message: string };

/** Opened from a claim link: take over the guest card and join its league. */
export default function ClaimScreen(): ReactNode {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { ready, user, refresh } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const [state, setState] = useState<State>({ kind: 'working' });

  useEffect(() => {
    if (!ready || !token) {
      return;
    }
    if (!user || user.isDemo) {
      setState({ kind: 'needs-sign-in' });
      return;
    }
    let alive = true;
    redeemClaimLink(token)
      .then(async () => {
        await refresh();
        notify.success('Player claimed', 'Your matches are now on your account.');
        router.replace('/(main)');
      })
      .catch((error: unknown) => {
        if (alive) {
          setState({ kind: 'failed', message: toUserMessage(error) });
        }
      });
    return () => {
      alive = false;
    };
  }, [ready, token, user, refresh]);

  if (state.kind === 'working') {
    return (
      <Screen>
        <LoadingState label="Claiming your player" />
      </Screen>
    );
  }
  return (
    <Screen>
      <Text style={typography.title}>
        {state.kind === 'needs-sign-in' ? 'Sign in to claim' : 'Could not claim'}
      </Text>
      <Text style={[typography.subtitle, styles.body]}>
        {state.kind === 'needs-sign-in'
          ? 'Sign in with Google, then open the claim link again to take over your player card.'
          : state.message}
      </Text>
      <Button
        label={state.kind === 'needs-sign-in' ? 'Sign in' : 'Go home'}
        onPress={() => router.replace(state.kind === 'needs-sign-in' ? '/login' : '/')}
      />
    </Screen>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    body: {
      marginVertical: spacing.md,
    },
  });
