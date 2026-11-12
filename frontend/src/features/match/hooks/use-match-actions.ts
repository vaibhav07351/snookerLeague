import { router } from 'expo-router';
import { useMemo } from 'react';

import type { MatchScreenState } from '@/features/match/hooks/use-match-screen';
import * as matchAdmin from '@/features/match/services/match-admin.service';
import * as matchService from '@/features/match/services/match.service';
import * as shotService from '@/features/match/services/shot.service';
import { haptic } from '@/shared/feedback/haptics';
import type { Match } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';

export interface ManualFrameInput {
  teamAPoints: number;
  teamBPoints: number;
  winner: 'a' | 'b';
}

export interface MatchActions {
  awardFrame: (winner: 'a' | 'b') => Promise<void>;
  /** Resolves true when the frame was logged (the form can close). */
  logManualFrame: (frame: ManualFrameInput) => Promise<boolean>;
  undo: () => Promise<void>;
  forfeit: (side: 'a' | 'b') => Promise<void>;
  toggleTitle: (on: boolean) => Promise<void>;
  remove: () => Promise<void>;
  rematch: () => Promise<void>;
}

/**
 * The match screen's actions that ask first: each confirms in the in-app sheet, then calls
 * the service through the screen's `run` (failures become a toast).
 */
export function useMatchActions(
  match: Match | null | undefined,
  s: Pick<MatchScreenState, 'run' | 'sideLabel' | 'actions'>,
  goBack: () => void,
): MatchActions {
  const { run, sideLabel, actions } = s;
  return useMemo(() => {
    const m = match ?? null;
    const full = (side: 'a' | 'b'): string => sideLabel(side);
    const open = m?.openFrame ?? null;
    const inProgress = m?.outcome.status === 'in_progress';

    async function awardFrame(winner: 'a' | 'b'): Promise<void> {
      if (!m || !open) {
        return;
      }
      const name = full(winner);
      const winnerPts = winner === 'a' ? open.teamAPoints : open.teamBPoints;
      const loserPts = winner === 'a' ? open.teamBPoints : open.teamAPoints;
      const behind =
        winnerPts < loserPts
          ? `\n\nNote: ${name} are behind on points (${winnerPts}-${loserPts}).`
          : '';
      const ok = await confirmAction(
        `Frame to ${name}?`,
        `End this frame at ${open.teamAPoints}-${open.teamBPoints} with ${name} winning it. You can undo this.${behind}`,
        'End frame',
      );
      if (
        ok &&
        (await run('Could not end the frame', () => shotService.completeLiveFrame(m.id, winner)))
      ) {
        haptic('success');
      }
    }

    async function logManualFrame(frame: ManualFrameInput): Promise<boolean> {
      if (!m) {
        return false;
      }
      const name = full(frame.winner);
      const shots = open?.shots.length ?? 0;
      const ok = await confirmAction(
        `Frame to ${name}?`,
        `Log ${frame.teamAPoints}-${frame.teamBPoints} to ${name}.${shots > 0 ? ' The shots logged in this frame are replaced.' : ''}`,
        'Log frame',
      );
      return ok && (await run('Could not log the frame', () => matchService.addFrame(m.id, frame)));
    }

    async function undo(): Promise<void> {
      if (!m) {
        return;
      }
      if (open && open.shots.length > 0) {
        await actions.undoShot();
        return;
      }
      const last = m.frames[m.frames.length - 1];
      if (!last) {
        return;
      }
      const ok = await confirmAction(
        'Undo the last frame?',
        `${full(last.winner)} won frame ${m.frames.length}${last.carriedOver ? '' : ` ${last.teamAPoints}-${last.teamBPoints}`}. Put it back on the table?`,
        'Undo frame',
      );
      if (ok) {
        await run('Could not undo the frame', () => shotService.undoLastFrame(m.id));
      }
    }

    async function forfeit(side: 'a' | 'b'): Promise<void> {
      if (!m) {
        return;
      }
      const quitting = full(side);
      const winning = full(side === 'a' ? 'b' : 'a');
      const ok = await confirmAction(
        `${quitting} concede this frame?`,
        `${winning} take the frame. If ${quitting} can no longer win the match, it ends and counts as a forfeit loss in stats.`,
        'Concede frame',
      );
      if (ok) {
        await run('Could not concede the frame', () => matchService.forfeitFrame(m.id, side));
      }
    }

    async function toggleTitle(on: boolean): Promise<void> {
      if (!m) {
        return;
      }
      if (on) {
        const ok = await confirmAction(
          'Make this a title match?',
          'The winner of this match becomes the reigning league champion.',
          'Make title match',
        );
        if (!ok) {
          return;
        }
      }
      if (await run('Could not update the match', () => matchAdmin.setTitleMatch(m.id, on))) {
        notify.success(on ? 'This is now a title match' : 'No longer a title match');
      }
    }

    async function remove(): Promise<void> {
      if (!m) {
        return;
      }
      const ok = await confirmAction(
        inProgress ? 'Abandon and delete this match?' : 'Delete this match?',
        'It is removed for everyone in the league and stats are recalculated. This cannot be undone.',
        'Delete match',
      );
      if (ok && (await run('Could not delete the match', () => matchAdmin.deleteMatch(m.id)))) {
        notify.success('Match deleted');
        goBack();
      }
    }

    async function rematch(): Promise<void> {
      const id = await actions.rematch();
      if (id) {
        router.replace({ pathname: '/match/[id]', params: { id } });
      }
    }

    return { awardFrame, logManualFrame, undo, forfeit, toggleTitle, remove, rematch };
  }, [match, run, sideLabel, actions, goBack]);
}
