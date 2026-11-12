import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  canConfirm,
  confirmResult,
  isConfirmedBy,
} from '@/features/match/services/match-confirm.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { Match, Player } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

/** "Did this result happen?" for the opponent, or a quiet line once they confirmed it. */
export function MatchConfirmBanner({
  match,
  players,
}: {
  match: Match;
  players: Player[];
}): ReactNode {
  const styles = useStyles(makeStyles);
  const { user } = useSession();
  if (canConfirm(match, user?.uid, players)) {
    return (
      <Card style={styles.card}>
        <Text style={styles.text}>
          Did this result happen? Confirming counts it for the public rating.
        </Text>
        <Button
          label="Confirm"
          icon="checkmark-done-outline"
          size="sm"
          onPress={() => {
            confirmResult(match.id).catch((error: unknown) => {
              notify.error('Could not confirm', toUserMessage(error));
            });
          }}
        />
      </Card>
    );
  }
  if (isConfirmedBy(match, user?.uid)) {
    return <Text style={styles.done}>You confirmed this result.</Text>;
  }
  return null;
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: spacing.sm,
    },
    text: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      lineHeight: 18,
      color: c.textMuted,
    },
    done: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
