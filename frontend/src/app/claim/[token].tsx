import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useClaimLink, type ClaimState } from '@/features/players/hooks/use-claim-link';
import { Button } from '@/shared/ui/Button';
import { LoadingState } from '@/shared/ui/LoadingState';
import { Screen } from '@/shared/ui/Screen';
import { useStyles } from '@/theme/ThemeProvider';
import { makeTypography, spacing, type Palette } from '@/theme/tokens';

function confirmText(state: Extract<ClaimState, { kind: 'confirm' }>): string {
  return state.preview
    ? `Join ${state.preview.leagueName} as ${state.preview.playerName}? Their matches move to your account.`
    : 'Take over this player card and its matches, and join its league?';
}

/** Opened from a claim link: asks first, then takes over the guest card and joins its league. */
export default function ClaimScreen(): ReactNode {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { state, claim } = useClaimLink(token);
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);

  if (state.kind === 'loading') {
    return (
      <Screen>
        <LoadingState label="Opening your link" />
      </Screen>
    );
  }
  if (state.kind === 'confirm') {
    return (
      <Screen>
        <Text style={typography.title}>Claim your player</Text>
        <Text style={[typography.subtitle, styles.body]}>{confirmText(state)}</Text>
        <View style={styles.actions}>
          <Button
            label={state.claiming ? 'Claiming...' : 'Yes, that is me'}
            icon="checkmark"
            disabled={state.claiming}
            onPress={() => void claim()}
          />
          <Button
            label="Not me"
            variant="secondary"
            disabled={state.claiming}
            onPress={() => router.replace('/')}
          />
        </View>
      </Screen>
    );
  }
  const signIn = state.kind === 'needs-sign-in';
  return (
    <Screen>
      <Text style={typography.title}>{signIn ? 'Sign in to claim' : 'Could not claim'}</Text>
      <Text style={[typography.subtitle, styles.body]}>
        {signIn
          ? 'Sign in with Google, then open the claim link again to take over your player card.'
          : state.message}
      </Text>
      <Button
        label={signIn ? 'Sign in' : 'Go home'}
        onPress={() => router.replace(signIn ? '/login' : '/')}
      />
    </Screen>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    body: {
      marginVertical: spacing.md,
    },
    actions: {
      gap: spacing.sm,
    },
  });
