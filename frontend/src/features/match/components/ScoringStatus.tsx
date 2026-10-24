import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface ScoringStatusProps {
  canScore: boolean;
  canTakeOver: boolean;
  scorerName: string | null;
  busy: boolean;
  onTakeOver: () => void;
}

/** Who is holding the "marker": you, or someone else (with a take-over button when allowed). */
export function ScoringStatus({
  canScore,
  canTakeOver,
  scorerName,
  busy,
  onTakeOver,
}: ScoringStatusProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();

  if (canScore) {
    return (
      <View style={[styles.bar, styles.barOn]}>
        <Ionicons name="create-outline" size={16} color={palette.primary} />
        <Text style={styles.text} numberOfLines={2}>
          <Text style={styles.strong}>You are scoring.</Text> Everyone else in the league sees it
          live.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <View style={[styles.liveDot, { backgroundColor: palette.live }]} />
      <Text style={styles.text} numberOfLines={2}>
        <Text style={styles.strong}>Watching live.</Text>{' '}
        {scorerName ? `${scorerName} is scoring.` : 'Another member is scoring.'}
        {!canTakeOver ? ' Only people chosen by the match creator can score.' : ''}
      </Text>
      {canTakeOver ? (
        <Button
          label="Take over"
          size="sm"
          variant="secondary"
          loading={busy}
          onPress={onTakeOver}
          accessibilityHint="Score this match from this phone"
        />
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    barOn: {
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    text: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    strong: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
  });
