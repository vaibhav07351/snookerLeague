import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { TextField } from '@/features/home/components/TextField';
import type { MidwayInput } from '@/features/match/services/match-admin.service';
import { Chip } from '@/shared/ui/Chip';
import { FULL_RACK_REDS } from '@/shared/types/domain';
import { Stepper } from '@/shared/ui/Stepper';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

interface MidwaySetupProps {
  teamALabel: string;
  teamBLabel: string;
  /** Frames needed to win; frames already won must stay below it. */
  framesToWin: number;
  onSubmit: (input: MidwayInput) => Promise<boolean>;
  onCancel: () => void;
}

function parsePoints(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? Math.min(200, Math.floor(n)) : 0;
}

/** "Already playing?": enter the score so far, then continue ball by ball from there. */
export function MidwaySetup({
  teamALabel,
  teamBLabel,
  framesToWin,
  onSubmit,
  onCancel,
}: MidwaySetupProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [framesA, setFramesA] = useState(0);
  const [framesB, setFramesB] = useState(0);
  const [pointsA, setPointsA] = useState('');
  const [pointsB, setPointsB] = useState('');
  const [atTable, setAtTable] = useState<'a' | 'b'>('a');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      await onSubmit({
        framesA,
        framesB,
        pointsA: parsePoints(pointsA),
        pointsB: parsePoints(pointsB),
        // Not asked, to keep the form short: the scoreboard's ball guide assumes a full rack.
        redsLeft: FULL_RACK_REDS,
        atTable,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Start from the current score</Text>
      <Text style={styles.hint}>
        Enter where the match is now. Scoring then carries on ball by ball from this point.
      </Text>

      <Text style={styles.section}>Frames won so far</Text>
      <View style={styles.row}>
        <Stepper
          label={teamALabel}
          value={framesA}
          min={0}
          max={framesToWin - 1}
          onChange={setFramesA}
        />
        <Stepper
          label={teamBLabel}
          value={framesB}
          min={0}
          max={framesToWin - 1}
          onChange={setFramesB}
        />
      </View>

      <Text style={styles.section}>This frame</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label={`${teamALabel} points`}
            value={pointsA}
            onChangeText={setPointsA}
            keyboardType="number-pad"
            placeholder="0"
            maxLength={3}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label={`${teamBLabel} points`}
            value={pointsB}
            onChangeText={setPointsB}
            keyboardType="number-pad"
            placeholder="0"
            maxLength={3}
          />
        </View>
      </View>

      <Text style={styles.section}>Who is at the table?</Text>
      <View style={styles.chips}>
        <Chip label={teamALabel} selected={atTable === 'a'} onPress={() => setAtTable('a')} />
        <Chip label={teamBLabel} selected={atTable === 'b'} onPress={() => setAtTable('b')} />
      </View>

      <View style={styles.row}>
        <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} style={styles.flex} />
        <Button
          label="Start scoring"
          size="sm"
          icon="play"
          loading={busy}
          onPress={() => void submit()}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
    },
    title: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
    section: {
      marginTop: spacing.xs,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    flex: {
      flex: 1,
      minWidth: 0,
    },
  });
