import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ResultActionBar } from '@/features/result/components/ResultActionBar';
import { ResultCelebration } from '@/features/result/components/ResultCelebration';
import { usePublicResult } from '@/features/result/hooks/use-public-result';
import type { ResultKind } from '@/features/result/types/result.types';
import { useSafeBack } from '@/shared/ui/HeaderBack';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LoadingState } from '@/shared/ui/LoadingState';
import { Screen } from '@/shared/ui/Screen';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

const NOUN: Record<ResultKind, string> = { match: 'Match', race: 'Race', group: 'Free-for-all' };

interface PublicResultScreenProps {
  kind: ResultKind;
  id: string | undefined;
}

/**
 * A game that is not on this phone (a result link from someone in another league, or not
 * synced yet): its public result from the server, on the same card a player would see.
 */
export function PublicResultScreen({ kind, id }: PublicResultScreenProps): ReactNode {
  const styles = useStyles(makeStyles);
  const goBack = useSafeBack('/(main)');
  const { state, retry } = usePublicResult(kind, id, true);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <Screen>
        <LoadingState label="Loading result" />
      </Screen>
    );
  }
  if (state.status === 'error') {
    return (
      <Screen>
        <ErrorState title="Couldn't load this result" message={state.message} onRetry={retry} />
      </Screen>
    );
  }
  if (state.status === 'not_found') {
    return (
      <Screen>
        <EmptyState
          icon="help-circle-outline"
          title={`${NOUN[kind]} not found`}
          message="It may have been deleted."
          actionLabel="Go back"
          onAction={goBack}
        />
      </Screen>
    );
  }
  return (
    <Screen contentStyle={styles.content}>
      <ResultCelebration view={state.view} />
      <ResultActionBar view={state.view.live ? null : state.view} actions={[]} />
      <Text style={styles.note}>
        Shared result. Names are shortened for people outside the league.
      </Text>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: {
      gap: spacing.md,
    },
    note: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
