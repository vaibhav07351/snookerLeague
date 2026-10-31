import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/features/home/components/BrandLogo';
import { Button } from '@/features/home/components/Button';
import {
  matchHighestBreak,
  shareMatchCard,
  shareMatchLink,
} from '@/features/match/services/share-match.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { Match } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface ShareMatchCardProps {
  match: Match;
  sideA: string;
  sideB: string;
}

/** A branded result card plus "share card" and "share link" buttons, shown after a match. */
export function ShareMatchCard({ match, sideA, sideB }: ShareMatchCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const card = useRef<View>(null);
  const best = matchHighestBreak(match);
  const winner = match.outcome.status === 'in_progress' ? null : match.outcome.winner;
  const summary = `${sideA} ${match.outcome.framesA} - ${match.outcome.framesB} ${sideB}`;
  const label = match.namedLabel || (match.crownsChampion ? 'Title match' : 'Snooker match');

  const onError = (error: unknown): void => notify.error('Could not share', toUserMessage(error));

  return (
    <View style={styles.wrap}>
      <View ref={card} collapsable={false} style={styles.card}>
        <View style={styles.brand}>
          <BrandLogo size={28} />
          <Text style={styles.brandText}>Snookit</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.side, winner === 'a' && styles.winner]} numberOfLines={2}>
            {sideA}
          </Text>
          <Text style={styles.score}>
            {match.outcome.framesA} - {match.outcome.framesB}
          </Text>
          <Text
            style={[styles.side, styles.right, winner === 'b' && styles.winner]}
            numberOfLines={2}
          >
            {sideB}
          </Text>
        </View>
        {best >= 50 ? <Text style={styles.extra}>Highest break {best}</Text> : null}
        {match.crownsChampion && winner ? (
          <Text style={styles.extra}>New reigning champions</Text>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <Button
          label="Share card"
          icon="image-outline"
          size="sm"
          onPress={() => void shareMatchCard(card, match, summary).catch(onError)}
        />
        <Button
          label="Share link"
          icon="link-outline"
          size="sm"
          variant="secondary"
          onPress={() => void shareMatchLink(match, summary).catch(onError)}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.borderStrong,
      padding: spacing.md,
      gap: spacing.sm,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    brandText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    side: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    right: {
      textAlign: 'right',
    },
    winner: {
      color: c.primary,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: 30,
      color: c.text,
    },
    extra: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.primary,
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
  });
