import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  compareRaceBoard,
  foulPointsOf,
  netRaceScore,
  raceShotSummary,
  type RacePlayerShots,
} from '@/features/race/services/race-helpers';
import type { Race, RaceEntrant, RacePlace } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { TextField } from '@/shared/ui/TextField';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, typeScale, type Palette } from '@/theme/tokens';

function formatRacePlace(place: RacePlace | null): string {
  if (place === null) {
    return '-';
  }
  return place === 'dnf' ? "Didn't finish" : `#${place}`;
}

/** "Best 40 · 3 reds · 2 misses · 4 safeties", leaving out what is zero; null when all are. */
function shotLine(shots: RacePlayerShots | undefined): string | null {
  if (!shots) {
    return null;
  }
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const parts = [
    shots.bestBreak > 0 ? `Best ${shots.bestBreak}` : null,
    shots.reds > 0 ? plural(shots.reds, 'red', 'reds') : null,
    shots.misses > 0 ? plural(shots.misses, 'miss', 'misses') : null,
    shots.safeties > 0 ? plural(shots.safeties, 'safety', 'safeties') : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function scoreLine(e: RaceEntrant): string {
  return foulPointsOf(e) > 0
    ? `Score ${netRaceScore(e)} (${e.score} potted, ${foulPointsOf(e)} in fouls)`
    : `Score ${netRaceScore(e)}`;
}

const draftOf = (e: RaceEntrant): string => (e.score === 0 ? '' : String(e.score));

interface RaceStandingsCardProps {
  race: Race;
  nameOf: (playerId: string) => string;
  /** Live: type a final score or mark a player out. Omit for the read-only final table. */
  edit?: {
    busyPlayerId: string | null;
    onSave: (playerId: string, score: number) => void;
    onOut: (playerId: string) => void;
    onUndoOut: (playerId: string) => void;
  };
}

/** Every entrant with place and score; editable while the race is live. */
export function RaceStandingsCard({ race, nameOf, edit }: RaceStandingsCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(race.entrants.map((e) => [e.playerId, draftOf(e)])),
  );
  // A score saved elsewhere replaces only that player's draft, so typing in another row stays.
  const seen = useRef<Record<string, string>>({ ...drafts });
  useEffect(() => {
    const changed: Record<string, string> = {};
    for (const e of race.entrants) {
      const next = draftOf(e);
      if (seen.current[e.playerId] !== next) {
        changed[e.playerId] = next;
        seen.current[e.playerId] = next;
      }
    }
    if (Object.keys(changed).length > 0) {
      setDrafts((prev) => ({ ...prev, ...changed }));
    }
  }, [race.entrants]);

  const sorted = [...race.entrants].sort(compareRaceBoard);
  const shots = edit ? {} : raceShotSummary(race.liveShots);

  return (
    <Card style={styles.list}>
      {sorted.map((e, index) => {
        const name = nameOf(e.playerId);
        const busy = edit?.busyPlayerId === e.playerId;
        const line = edit ? null : shotLine(shots[e.playerId]);
        return (
          <View key={e.playerId} style={[styles.row, index > 0 && styles.rowDivider]}>
            <View style={styles.rowHead}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={[styles.place, e.place === 'dnf' && styles.placeOut]}>
                {formatRacePlace(e.place)}
              </Text>
            </View>
            {edit && e.place === null ? (
              <View style={styles.scoreEdit}>
                <View style={styles.scoreField}>
                  <TextField
                    label="Potted points"
                    value={drafts[e.playerId] ?? ''}
                    onChangeText={(t) => setDrafts((prev) => ({ ...prev, [e.playerId]: t }))}
                    keyboardType="number-pad"
                    placeholder="Tap to type"
                  />
                </View>
                <Button
                  label="Save"
                  variant="secondary"
                  onPress={() => {
                    const raw = (drafts[e.playerId] ?? '').trim();
                    edit.onSave(e.playerId, raw === '' ? 0 : Number(raw) || 0);
                  }}
                  style={styles.save}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${name} as didn't finish`}
                  disabled={busy}
                  onPress={() => edit.onOut(e.playerId)}
                  style={styles.outLink}
                >
                  <Text style={styles.outLinkText}>{busy ? '...' : 'Out'}</Text>
                </Pressable>
              </View>
            ) : edit && e.place === 'dnf' ? (
              <View style={styles.outRow}>
                <Text style={styles.finalScore}>{scoreLine(e)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Undo didn't finish for ${name}`}
                  disabled={busy}
                  onPress={() => edit.onUndoOut(e.playerId)}
                  style={styles.outLink}
                >
                  <Text style={styles.undoLinkText}>{busy ? '...' : 'Undo'}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.finalScore}>{scoreLine(e)}</Text>
            )}
            {line ? <Text style={styles.shotLine}>{line}</Text> : null}
          </View>
        );
      })}
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      paddingVertical: spacing.xs,
      gap: 0,
    },
    row: {
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: 28,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.lead,
    },
    place: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: typeScale.body,
    },
    placeOut: {
      color: c.danger,
    },
    scoreEdit: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    scoreField: {
      flex: 1,
      minWidth: 0,
    },
    save: {
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 52,
    },
    outLink: {
      minHeight: 52,
      minWidth: TOUCH_TARGET,
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outLinkText: {
      fontFamily: fonts.bodyBold,
      color: c.danger,
      fontSize: typeScale.body,
    },
    outRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    undoLinkText: {
      fontFamily: fonts.bodyBold,
      color: c.info,
      fontSize: typeScale.body,
    },
    finalScore: {
      fontFamily: fonts.body,
      color: c.textMuted,
    },
    shotLine: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textFaint,
    },
  });
