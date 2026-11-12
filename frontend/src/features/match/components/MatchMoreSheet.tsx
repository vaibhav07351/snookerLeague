import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { ManualFrameForm } from '@/features/match/components/ManualFrameForm';
import { MatchOptions } from '@/features/match/components/MatchOptions';
import type { MatchActions } from '@/features/match/hooks/use-match-actions';
import type { MatchScreenState } from '@/features/match/hooks/use-match-screen';
import * as matchAdmin from '@/features/match/services/match-admin.service';
import type { Match } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Stepper } from '@/shared/ui/Stepper';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, typeScale, type Palette } from '@/theme/tokens';

/** Time for a bottom sheet's slide-out before another sheet can safely open. */
const SHEET_CLOSE_MS = 400;

interface MatchMoreSheetProps {
  visible: boolean;
  onClose: () => void;
  match: Match;
  s: MatchScreenState;
  actions: MatchActions;
  /** Who is scoring / take over, shown at the top while scoring. */
  scoringStatus: ReactNode;
  /** No frame played yet: "start from the current score" is offered. */
  canStartMidway: boolean;
  onStartMidway: () => void;
}

/** The match's rare actions: reds fix, midway start, manual frame, title, scoring, delete. */
export function MatchMoreSheet({
  visible,
  onClose,
  match: m,
  s,
  actions,
  scoringStatus,
  canStartMidway,
  onStartMidway,
}: MatchMoreSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const [showManual, setShowManual] = useState(false);
  const inProgress = m.outcome.status === 'in_progress';
  const { canScore, busy, table, run } = s;
  const scoring = inProgress && canScore;
  const open = m.openFrame ?? null;
  const labelA = s.sideLabel('a', true);
  const labelB = s.sideLabel('b', true);

  const close = (): void => {
    onClose();
    setShowManual(false);
  };
  // A sheet opened while this one is still sliding away can be dropped, so wait for it.
  const afterClose = (action: () => void): void => {
    close();
    setTimeout(action, SHEET_CLOSE_MS);
  };

  return (
    <BottomSheet visible={visible} title="Match options" onClose={close}>
      {scoring ? scoringStatus : null}
      {scoring &&
      open &&
      table &&
      (table.on.kind === 'red' || table.on.kind === 'colour' || (open.redsRemoved ?? 0) > 0) ? (
        // For a red that went down without being logged (knocked in on a foul, say).
        <Stepper
          label="Reds on the table"
          value={table.redsLeft}
          min={0}
          max={table.redsLeft + (open.redsRemoved ?? 0)}
          onChange={(next) => s.actions.adjustReds(next < table.redsLeft ? -1 : 1)}
        />
      ) : null}
      {canStartMidway ? (
        <Button
          label="Already playing? Start from the current score"
          icon="play-forward-outline"
          size="sm"
          variant="secondary"
          onPress={() => {
            close();
            onStartMidway();
          }}
        />
      ) : null}
      {scoring ? (
        showManual ? (
          <Card>
            <ManualFrameForm
              teamALabel={labelA}
              teamBLabel={labelB}
              onSubmit={async (frame) => {
                if (await actions.logManualFrame(frame)) {
                  close();
                }
              }}
            />
            <Pressable onPress={() => setShowManual(false)} style={styles.linkRow}>
              <Text style={styles.linkMuted}>Cancel</Text>
            </Pressable>
          </Card>
        ) : (
          <Button
            label="Log a frame by final score"
            icon="create-outline"
            size="sm"
            variant="secondary"
            onPress={() => setShowManual(true)}
          />
        )
      ) : null}
      {!inProgress && canScore && m.frames.length > 0 ? (
        <Button
          label="Undo last frame and keep playing"
          icon="arrow-undo-outline"
          size="sm"
          variant="secondary"
          onPress={() => afterClose(() => void actions.undo())}
        />
      ) : null}
      <MatchOptions
        embedded
        match={m}
        inProgress={inProgress}
        canScore={canScore}
        canManage={s.canManage}
        members={s.memberPlayers}
        creatorUid={m.createdByUid}
        teamALabel={labelA}
        teamBLabel={labelB}
        busy={busy}
        onTitleMatch={(on) => void actions.toggleTitle(on)}
        onPolicy={(policy, allowed) =>
          void run('Could not update scoring', () =>
            matchAdmin.setScoringPolicy(m.id, policy, allowed),
          )
        }
        onForfeit={(side) => afterClose(() => void actions.forfeit(side))}
        onDelete={() => afterClose(() => void actions.remove())}
      />
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    linkRow: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    linkMuted: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
