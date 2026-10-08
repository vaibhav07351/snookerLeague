import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { Chip } from '@/shared/ui/Chip';
import type { Match, Player, ScoringPolicy } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface MatchOptionsProps {
  match: Match;
  inProgress: boolean;
  canScore: boolean;
  canManage: boolean;
  /** League members with an account, for "who can score". */
  members: Player[];
  creatorUid: string;
  teamALabel: string;
  teamBLabel: string;
  busy: boolean;
  onTitleMatch: (on: boolean) => void;
  onPolicy: (policy: ScoringPolicy, allowedUids: string[]) => void;
  onForfeit: (side: 'a' | 'b') => void;
  onDelete: () => void;
}

/** Less frequent match controls, folded away so the scoring pad stays uncluttered. */
export function MatchOptions({
  match,
  inProgress,
  canScore,
  canManage,
  members,
  creatorUid,
  teamALabel,
  teamBLabel,
  busy,
  onTitleMatch,
  onPolicy,
  onForfeit,
  onDelete,
}: MatchOptionsProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const [open, setOpen] = useState(false);

  if (!canScore && !canManage) {
    return null;
  }

  const policy = match.scoringPolicy ?? 'anyone';
  const allowed = match.allowedScorerUids ?? [];
  const pickable = members.filter((p) => p.authUid && p.authUid !== creatorUid);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
      >
        <Ionicons name="options-outline" size={18} color={palette.text} />
        <Text style={styles.headerText}>Match options</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {canManage && inProgress ? (
            <View style={styles.optionRow}>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>Title match</Text>
                <Text style={styles.optionHint}>The winner becomes the league champion.</Text>
              </View>
              <Switch
                value={match.crownsChampion}
                disabled={busy}
                onValueChange={onTitleMatch}
                trackColor={{ false: palette.cardRaised, true: palette.primary }}
                thumbColor={palette.text}
                accessibilityLabel="Title match"
              />
            </View>
          ) : null}

          {canManage && inProgress ? (
            <View style={styles.block}>
              <Text style={styles.optionTitle}>Who can take over scoring</Text>
              <View style={styles.chips}>
                <Chip
                  label="Anyone in the league"
                  selected={policy === 'anyone'}
                  onPress={() => onPolicy('anyone', allowed)}
                />
                <Chip
                  label="Only people I pick"
                  selected={policy === 'chosen'}
                  onPress={() => onPolicy('chosen', allowed)}
                />
              </View>
              {policy === 'chosen' ? (
                pickable.length > 0 ? (
                  <View style={styles.chips}>
                    {pickable.map((p) => {
                      const uid = p.authUid!;
                      const on = allowed.includes(uid);
                      return (
                        <Chip
                          key={p.id}
                          label={p.displayName}
                          selected={on}
                          onPress={() =>
                            onPolicy(
                              'chosen',
                              on ? allowed.filter((u) => u !== uid) : [...allowed, uid],
                            )
                          }
                        />
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.optionHint}>
                    Nobody else in this league has an account yet. Invite friends from the League
                    screen.
                  </Text>
                )
              ) : null}
            </View>
          ) : null}

          {canScore && inProgress ? (
            <View style={styles.block}>
              <Text style={styles.optionTitle}>Concede this frame</Text>
              <View style={styles.row}>
                <Button
                  size="sm"
                  variant="secondary"
                  label={`${teamALabel} concede`}
                  onPress={() => onForfeit('a')}
                  style={styles.flex}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  label={`${teamBLabel} concede`}
                  onPress={() => onForfeit('b')}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : null}

          {canManage ? (
            <Button
              variant="danger"
              size="sm"
              icon="trash-outline"
              label={inProgress ? 'Abandon and delete match' : 'Delete match'}
              onPress={onDelete}
              disabled={busy}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    headerText: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    body: {
      gap: spacing.md,
      padding: spacing.md,
      paddingTop: 0,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    optionText: {
      flex: 1,
      minWidth: 0,
    },
    optionTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.text,
    },
    optionHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
    },
    block: {
      gap: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    flex: {
      flex: 1,
      minWidth: 0,
    },
  });
