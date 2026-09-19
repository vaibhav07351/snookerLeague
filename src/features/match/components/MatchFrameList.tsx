import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { TextField } from '@/features/home/components/TextField';
import type { FrameScore } from '@/shared/types/domain';
import { formatDuration } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export interface FramePlayerLine {
  playerId: string;
  name: string;
  scored: number;
  foulPoints: number;
}

export interface MatchFrameListProps {
  frames: FrameScore[];
  playerPoints?: FramePlayerLine[][];
  onUpdate: (
    index: number,
    patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b' },
  ) => Promise<void>;
  onDelete: (index: number) => Promise<void>;
  onClearTime: (index: number) => Promise<void>;
}

export function MatchFrameList({
  frames,
  playerPoints,
  onUpdate,
  onDelete,
  onClearTime,
}: MatchFrameListProps): ReactNode {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editA, setEditA] = useState('');
  const [editB, setEditB] = useState('');
  const [editWinner, setEditWinner] = useState<'a' | 'b'>('a');
  const [busy, setBusy] = useState(false);

  function startEdit(index: number): void {
    const f = frames[index];
    if (!f) {
      return;
    }
    setEditingIndex(index);
    setEditA(String(f.teamAPoints));
    setEditB(String(f.teamBPoints));
    setEditWinner(f.winner);
  }

  async function saveEdit(): Promise<void> {
    if (editingIndex == null) {
      return;
    }
    setBusy(true);
    try {
      await onUpdate(editingIndex, {
        teamAPoints: editA.trim() === '' ? 0 : Number(editA) || 0,
        teamBPoints: editB.trim() === '' ? 0 : Number(editB) || 0,
        winner: editWinner,
      });
      setEditingIndex(null);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(index: number): void {
    Alert.alert(
      'Delete frame?',
      `Remove frame ${index + 1}? The match score will be recalculated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void onDelete(index);
            if (editingIndex === index) {
              setEditingIndex(null);
            }
          },
        },
      ],
    );
  }

  if (frames.length === 0) {
    return <Text style={styles.empty}>No frames yet</Text>;
  }

  return (
    <View style={styles.list}>
      {frames.map((f, i) => {
        const editing = editingIndex === i;
        const playerLines = (playerPoints?.[i] ?? []).filter(
          (p) => p.scored > 0 || p.foulPoints > 0,
        );
        return (
          <View key={`${i}-${f.winner}-${f.teamAPoints}-${f.teamBPoints}`} style={styles.row}>
            {editing ? (
              <View style={styles.editBox}>
                <Text style={styles.editTitle}>Edit frame {i + 1}</Text>
                <View style={styles.ptsRow}>
                  <View style={styles.ptsField}>
                    <TextField
                      label="Team A"
                      value={editA}
                      onChangeText={setEditA}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={styles.ptsField}>
                    <TextField
                      label="Team B"
                      value={editB}
                      onChangeText={setEditB}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <View style={styles.winnerRow}>
                  <Button
                    label="A won"
                    variant={editWinner === 'a' ? 'primary' : 'secondary'}
                    onPress={() => setEditWinner('a')}
                    style={styles.half}
                  />
                  <Button
                    label="B won"
                    variant={editWinner === 'b' ? 'primary' : 'secondary'}
                    onPress={() => setEditWinner('b')}
                    style={styles.half}
                  />
                </View>
                <View style={styles.winnerRow}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setEditingIndex(null)}
                    style={styles.half}
                    disabled={busy}
                  />
                  <Button
                    label="Save"
                    onPress={() => void saveEdit()}
                    style={styles.half}
                    loading={busy}
                    disabled={busy}
                  />
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.frameText}>
                  Frame {i + 1}: {f.teamAPoints}–{f.teamBPoints} (Team {f.winner.toUpperCase()}
                  {f.viaForfeit ? ', via forfeit' : ''}
                  {typeof f.durationSeconds === 'number'
                    ? ` · ${formatDuration(f.durationSeconds)}`
                    : ''}
                  )
                </Text>
                {playerLines.length > 0 ? (
                  <View style={styles.players}>
                    {playerLines.map((p) => (
                      <Text key={p.playerId} style={styles.playerLine}>
                        {p.name} · {p.scored}
                        {p.foulPoints > 0 ? ` · Foul ${p.foulPoints}` : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.actions}>
                  <Pressable onPress={() => startEdit(i)} hitSlop={8}>
                    <Text style={styles.actionEdit}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(i)} hitSlop={8}>
                    <Text style={styles.actionDelete}>Delete</Text>
                  </Pressable>
                  {typeof f.durationSeconds === 'number' ? (
                    <Pressable onPress={() => void onClearTime(i)} hitSlop={8}>
                      <Text style={styles.actionClear}>Clear time</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
  },
  row: {
    paddingVertical: spacing.xs,
    gap: 4,
  },
  frameText: {
    fontFamily: fonts.body,
    color: colors.chalk,
  },
  players: {
    gap: 2,
    paddingLeft: 2,
  },
  playerLine: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionEdit: {
    fontFamily: fonts.bodyMedium,
    color: colors.sky,
    fontSize: 12,
  },
  actionDelete: {
    fontFamily: fonts.bodyMedium,
    color: colors.danger,
    fontSize: 12,
  },
  actionClear: {
    fontFamily: fonts.bodyMedium,
    color: colors.coral,
    fontSize: 12,
  },
  editBox: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  editTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
  },
  ptsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ptsField: {
    flex: 1,
  },
  winnerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
});
