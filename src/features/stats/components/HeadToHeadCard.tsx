import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import type { HeadToHead, Meeting } from '@/features/stats/services/head-to-head.service';
import { Card } from '@/shared/ui/Card';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface HeadToHeadCardProps {
  h2h: HeadToHead;
  dense: boolean;
}

function summary(h: HeadToHead): string {
  const parts: string[] = [];
  if (h.matchesPlayed > 0) {
    parts.push(`Frames ${h.aFrames}-${h.bFrames}`);
  }
  if (h.racesShared > 0) {
    parts.push(`Races ahead ${h.aAhead}-${h.bAhead}`);
  }
  if (h.partnerPlayed > 0) {
    parts.push(`Partners ${h.partnerWins}W ${h.partnerPlayed - h.partnerWins}L`);
  }
  return parts.join(' · ');
}

function letter(m: Meeting): string {
  return m.winner === 'a' ? 'W' : m.winner === 'b' ? 'L' : 'D';
}

/** Their record against each other, plus the last few meetings (tap to open one). */
export function HeadToHeadCard({ h2h, dense }: HeadToHeadCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const met = h2h.matchesPlayed + h2h.racesShared > 0;
  const line = summary(h2h);

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Head to head</Text>
      {met ? (
        <>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, { color: palette.teamA }, dense && styles.scoreDense]}>
              {h2h.aWins}
            </Text>
            <Text style={styles.scoreMid}>matches</Text>
            <Text style={[styles.score, { color: palette.teamB }, dense && styles.scoreDense]}>
              {h2h.bWins}
            </Text>
          </View>
          {line ? (
            <Text style={styles.line} numberOfLines={1}>
              {line}
            </Text>
          ) : null}
          <View style={styles.meetings}>
            {h2h.meetings.map((m) => {
              const color =
                m.winner === 'a'
                  ? palette.success
                  : m.winner === 'b'
                    ? palette.danger
                    : palette.textMuted;
              return (
                <Pressable
                  key={`${m.kind}-${m.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.kind === 'race' ? 'Race' : 'Match'} ${m.score}`}
                  onPress={() =>
                    router.push(m.kind === 'race' ? `/race/${m.id}` : `/match/${m.id}`)
                  }
                  style={({ pressed }) => [
                    styles.meeting,
                    { borderColor: color },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.meetingLetter, { color }]}>{letter(m)}</Text>
                  <Text style={styles.meetingScore} numberOfLines={1}>
                    {m.score}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <View style={styles.never}>
          <Text style={styles.line}>
            {h2h.partnerPlayed > 0
              ? `Never opponents yet · ${line}`
              : 'These two have never played each other.'}
          </Text>
          <Button label="Start a match" size="sm" onPress={() => router.push('/match/new')} />
        </View>
      )}
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
      textAlign: 'center',
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: 34,
      minWidth: 48,
      textAlign: 'center',
    },
    scoreDense: {
      fontSize: 28,
    },
    scoreMid: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: c.textMuted,
    },
    line: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
    meetings: {
      flexDirection: 'row',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: 2,
    },
    meeting: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
      borderWidth: 1,
      backgroundColor: c.cardRaised,
    },
    pressed: {
      opacity: 0.75,
    },
    meetingLetter: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
    },
    meetingScore: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: c.text,
    },
    never: {
      alignItems: 'center',
      gap: spacing.sm,
    },
  });
