import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radii, spacing } from '@/theme/tokens';

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
      <Text style={styles.heading}>Or log this frame by final score</Text>
      <Text style={styles.hint}>Type the finished points, then tap who won the frame.</Text>
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
            placeholderTextColor={colors.chalkMuted}
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
            placeholderTextColor={colors.chalkMuted}
            editable={!disabled && !busy}
            style={styles.input}
          />
        </View>
      </View>
      <View style={styles.winRow}>
        <Pressable
          disabled={disabled || busy}
          onPress={() => void save('a')}
          style={[styles.win, (disabled || busy) && styles.disabled]}
        >
          <Text style={styles.winText} numberOfLines={2}>
            {teamALabel} wins
          </Text>
        </Pressable>
        <Pressable
          disabled={disabled || busy}
          onPress={() => void save('b')}
          style={[styles.win, styles.winB, (disabled || busy) && styles.disabled]}
        >
          <Text style={styles.winTextB} numberOfLines={2}>
            {teamBLabel} wins
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  heading: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
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
    color: colors.chalkMuted,
    fontSize: 11,
  },
  input: {
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.chalk,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  winRow: {
    flexDirection: 'row',
    gap: 6,
  },
  win: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  winB: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.mint,
  },
  winText: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 13,
    textAlign: 'center',
  },
  winTextB: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 13,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
