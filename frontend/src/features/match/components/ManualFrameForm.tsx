import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

interface ManualFrameFormProps {
  teamALabel: string;
  teamBLabel: string;
  disabled?: boolean;
  onDraftChange?: (draft: { teamAPoints: number; teamBPoints: number } | null) => void;
  onSubmit: (frame: {
    teamAPoints: number;
    teamBPoints: number;
    winner: 'a' | 'b';
  }) => Promise<void>;
}

function parsePoints(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

export function ManualFrameForm({
  teamALabel,
  teamBLabel,
  disabled,
  onDraftChange,
  onSubmit,
}: ManualFrameFormProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const [ptsA, setPtsA] = useState('');
  const [ptsB, setPtsB] = useState('');
  const [busy, setBusy] = useState(false);

  function emitDraft(nextA: string, nextB: string): void {
    if (!onDraftChange) {
      return;
    }
    if (nextA.trim() === '' && nextB.trim() === '') {
      onDraftChange(null);
      return;
    }
    onDraftChange({ teamAPoints: parsePoints(nextA), teamBPoints: parsePoints(nextB) });
  }

  async function save(winner: 'a' | 'b'): Promise<void> {
    if (disabled || busy) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        teamAPoints: parsePoints(ptsA),
        teamBPoints: parsePoints(ptsB),
        winner,
      });
      setPtsA('');
      setPtsB('');
      onDraftChange?.(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Log this frame by final score</Text>
      <Text style={styles.hint}>
        Type the finished points, then tap who won. Any shots logged in this frame are replaced.
      </Text>
      <View style={styles.ptsRow}>
        <View style={styles.ptsCol}>
          <Text style={styles.label} numberOfLines={1}>
            {teamALabel}
          </Text>
          <TextInput
            value={ptsA}
            onChangeText={(text) => {
              setPtsA(text);
              emitDraft(text, ptsB);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={palette.textFaint}
            editable={!disabled && !busy}
            style={styles.input}
          />
        </View>
        <View style={styles.ptsCol}>
          <Text style={styles.label} numberOfLines={1}>
            {teamBLabel}
          </Text>
          <TextInput
            value={ptsB}
            onChangeText={(text) => {
              setPtsB(text);
              emitDraft(ptsA, text);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={palette.textFaint}
            editable={!disabled && !busy}
            style={styles.input}
          />
        </View>
      </View>
      <View style={styles.winRow}>
        <Pressable
          disabled={disabled || busy}
          onPress={() => void save('a')}
          style={[
            styles.win,
            { borderColor: palette.teamA },
            (disabled || busy) && styles.disabled,
          ]}
        >
          <Text style={[styles.winText, { color: palette.teamA }]} numberOfLines={2}>
            {teamALabel} won
          </Text>
        </Pressable>
        <Pressable
          disabled={disabled || busy}
          onPress={() => void save('b')}
          style={[
            styles.win,
            { borderColor: palette.teamB },
            (disabled || busy) && styles.disabled,
          ]}
        >
          <Text style={[styles.winText, { color: palette.teamB }]} numberOfLines={2}>
            {teamBLabel} won
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
    },
    heading: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 13,
      letterSpacing: 0.4,
    },
    hint: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    ptsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    ptsCol: {
      flex: 1,
      gap: 4,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      color: c.textMuted,
      fontSize: 11,
    },
    input: {
      minHeight: 44,
      minWidth: 0,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      color: c.text,
      fontFamily: fonts.bodyBold,
      // 16px on web avoids mobile Safari auto-zoom on focus.
      fontSize: Platform.OS === 'web' ? 16 : 18,
      paddingHorizontal: 10,
      textAlign: 'center',
    },
    winRow: {
      flexDirection: 'row',
      gap: 6,
    },
    win: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    winText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.4,
    },
  });
