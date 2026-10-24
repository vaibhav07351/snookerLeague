import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { TextField } from '@/features/home/components/TextField';
import { FrameLiveRanks } from '@/features/match/components/FrameLiveRanks';
import type { FrameScore } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { formatDuration } from '@/shared/utils/datetime';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

export interface FramePlayerLine {
  playerId: string;
  name: string;
  side: 'a' | 'b';
  scored: number;
  foulPoints: number;
  highestBreak: number;
}

export interface MatchFrameListProps {
  frames: FrameScore[];
  /** Per-frame player lines, same index as `frames`. */
  playerPoints: FramePlayerLine[][];
  teamALabel: string;
  teamBLabel: string;
  canEdit: boolean;
  onUpdate: (
    index: number,
    patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b' },
  ) => Promise<boolean>;
  onDelete: (index: number) => Promise<boolean>;
  onClearTime: (index: number) => Promise<boolean>;
}

/** Finished frames, newest first, each with a per-player table (best break, points, fouls). */
export function MatchFrameList({
  frames,
  playerPoints,
  teamALabel,
  teamBLabel,
  canEdit,
  onUpdate,
  onDelete,
  onClearTime,
}: MatchFrameListProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (frames.length === 0) {
    return <Text style={styles.empty}>Finished frames will appear here.</Text>;
  }

  const newestFirst = frames.map((frame, index) => ({ frame, index })).reverse();

  return (
    <View style={styles.list}>
      {newestFirst.map(({ frame, index }) =>
        editingIndex === index ? (
          <FrameEditor
            key={`edit-${index}`}
            index={index}
            frame={frame}
            teamALabel={teamALabel}
            teamBLabel={teamBLabel}
            onCancel={() => setEditingIndex(null)}
            onSave={async (patch) => {
              if (await onUpdate(index, patch)) {
                setEditingIndex(null);
              }
            }}
          />
        ) : (
          <FrameCard
            key={`frame-${index}`}
            index={index}
            frame={frame}
            lines={playerPoints[index] ?? []}
            teamALabel={teamALabel}
            teamBLabel={teamBLabel}
            canEdit={canEdit}
            onEdit={() => setEditingIndex(index)}
            onDelete={async () => {
              const ok = await confirmAction(
                `Delete frame ${index + 1}?`,
                'The match score will be recalculated.',
                'Delete',
              );
              if (ok) {
                await onDelete(index);
              }
            }}
            onClearTime={() => void onClearTime(index)}
          />
        ),
      )}
    </View>
  );
}

function FrameCard({
  index,
  frame,
  lines,
  teamALabel,
  teamBLabel,
  canEdit,
  onEdit,
  onDelete,
  onClearTime,
}: {
  index: number;
  frame: FrameScore;
  lines: FramePlayerLine[];
  teamALabel: string;
  teamBLabel: string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onClearTime: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const winnerLabel = frame.winner === 'a' ? teamALabel : teamBLabel;
  const tone = sideColor(palette, frame.winner);
  const notes = [
    frame.viaForfeit ? 'by forfeit' : null,
    typeof frame.durationSeconds === 'number' ? formatDuration(frame.durationSeconds) : null,
    frame.carriedPoints
      ? `scoring started at ${frame.carriedPoints.a}-${frame.carriedPoints.b}`
      : null,
  ].filter(Boolean);
  const hasPlayerStats = lines.some((l) => l.scored > 0 || l.foulPoints > 0);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.frameNo}>Frame {index + 1}</Text>
        {frame.carriedOver ? (
          <Text style={styles.score}>won before scoring</Text>
        ) : (
          <Text style={styles.score}>
            {frame.teamAPoints}-{frame.teamBPoints}
          </Text>
        )}
      </View>
      <Text style={[styles.winner, { color: tone }]} numberOfLines={1}>
        {winnerLabel} won
      </Text>
      {notes.length > 0 ? <Text style={styles.notes}>{notes.join(' · ')}</Text> : null}
      {hasPlayerStats ? (
        <View style={styles.lines}>
          <FrameLiveRanks ranks={lines} showBreaks />
        </View>
      ) : null}
      {canEdit ? (
        <View style={styles.actions}>
          {!frame.carriedOver ? (
            <Pressable onPress={onEdit} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.action, { color: palette.info }]}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void onDelete()} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.action, { color: palette.danger }]}>Delete</Text>
          </Pressable>
          {typeof frame.durationSeconds === 'number' ? (
            <Pressable onPress={onClearTime} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.action, { color: palette.textMuted }]}>Clear time</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FrameEditor({
  index,
  frame,
  teamALabel,
  teamBLabel,
  onCancel,
  onSave,
}: {
  index: number;
  frame: FrameScore;
  teamALabel: string;
  teamBLabel: string;
  onCancel: () => void;
  onSave: (patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b' }) => Promise<void>;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const [editA, setEditA] = useState(String(frame.teamAPoints));
  const [editB, setEditB] = useState(String(frame.teamBPoints));
  const [winner, setWinner] = useState<'a' | 'b'>(frame.winner);
  const [busy, setBusy] = useState(false);

  const parse = (raw: string): number => {
    const n = Number(raw.trim());
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };

  return (
    <View style={[styles.card, styles.editCard]}>
      <Text style={styles.frameNo}>Edit frame {index + 1}</Text>
      <View style={styles.editRow}>
        <View style={styles.editField}>
          <TextField
            label={teamALabel}
            value={editA}
            onChangeText={setEditA}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.editField}>
          <TextField
            label={teamBLabel}
            value={editB}
            onChangeText={setEditB}
            keyboardType="number-pad"
          />
        </View>
      </View>
      <View style={styles.editRow}>
        <Button
          size="sm"
          label={`${teamALabel} won`}
          variant={winner === 'a' ? 'primary' : 'secondary'}
          onPress={() => setWinner('a')}
          style={styles.flex}
        />
        <Button
          size="sm"
          label={`${teamBLabel} won`}
          variant={winner === 'b' ? 'primary' : 'secondary'}
          onPress={() => setWinner('b')}
          style={styles.flex}
        />
      </View>
      <View style={styles.editRow}>
        <Button
          size="sm"
          label="Cancel"
          variant="ghost"
          onPress={onCancel}
          disabled={busy}
          style={styles.flex}
        />
        <Button
          size="sm"
          label="Save"
          loading={busy}
          style={styles.flex}
          onPress={() => {
            setBusy(true);
            void onSave({ teamAPoints: parse(editA), teamBPoints: parse(editB), winner }).finally(
              () => setBusy(false),
            );
          }}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      gap: spacing.sm,
    },
    empty: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      padding: spacing.md,
      gap: 4,
    },
    editCard: {
      gap: spacing.sm,
      borderColor: c.borderStrong,
    },
    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    frameNo: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    score: {
      fontFamily: fonts.display,
      fontSize: 18,
      color: c.text,
    },
    winner: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
    notes: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    lines: {
      marginTop: 4,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.lg,
      marginTop: spacing.sm,
    },
    action: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
    },
    editRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    editField: {
      flex: 1,
      minWidth: 0,
    },
    flex: {
      flex: 1,
    },
  });
