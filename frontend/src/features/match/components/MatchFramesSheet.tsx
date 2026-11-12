import { useMemo, type ReactNode } from 'react';

import { MatchFrameList, type FramePlayerLine } from '@/features/match/components/MatchFrameList';
import { MatchSummaryCard } from '@/features/match/components/MatchSummaryCard';
import type { MatchScreenState } from '@/features/match/hooks/use-match-screen';
import * as matchService from '@/features/match/services/match.service';
import { summarizeMatch } from '@/features/match/services/match-summary';
import type { Match } from '@/shared/types/domain';
import { BottomSheet } from '@/shared/ui/BottomSheet';

interface MatchFramesSheetProps {
  visible: boolean;
  onClose: () => void;
  match: Match;
  s: MatchScreenState;
  /** "Highest break so far" line, shown while the match is live. */
  topBreakLine: ReactNode;
}

/** Frames of the match (editable by the scorer), plus the summary table once finished. */
export function MatchFramesSheet({
  visible,
  onClose,
  match: m,
  s,
  topBreakLine,
}: MatchFramesSheetProps): ReactNode {
  const finished = m.outcome.status !== 'in_progress';
  const { shortName, run } = s;
  const labelA = s.sideLabel('a', true);
  const labelB = s.sideLabel('b', true);

  // Per-frame player lines (short names). Only worked out while the sheet is open, not on
  // every shot.
  const frameLines = useMemo<FramePlayerLine[][]>(() => {
    if (!visible) {
      return [];
    }
    return m.frames.map((frame) =>
      summarizeMatch({ ...m, frames: [frame], openFrame: null }).players.map((p) => ({
        playerId: p.playerId,
        name: shortName(p.playerId),
        side: p.side,
        scored: p.scored,
        foulPoints: p.foulPoints,
        highestBreak: p.highestBreak,
        misses: p.misses,
        safeties: p.safeties,
      })),
    );
  }, [m, shortName, visible]);

  return (
    <BottomSheet visible={visible} title={finished ? 'Match details' : 'Frames'} onClose={onClose}>
      {finished ? null : topBreakLine}
      {finished && s.summary ? (
        <MatchSummaryCard
          summary={s.summary}
          teamALabel={labelA}
          teamBLabel={labelB}
          nameOf={shortName}
        />
      ) : null}
      <MatchFrameList
        frames={m.frames}
        playerPoints={frameLines}
        teamALabel={labelA}
        teamBLabel={labelB}
        canEdit={s.canScore || s.canManage}
        onUpdate={(index, patch) =>
          run('Could not update the frame', () => matchService.updateFrame(m.id, index, patch))
        }
        onDelete={(index) =>
          run('Could not delete the frame', () => matchService.deleteFrame(m.id, index))
        }
        onClearTime={(index) =>
          run('Could not clear the time', () => matchService.clearFrameDuration(m.id, index))
        }
      />
    </BottomSheet>
  );
}
