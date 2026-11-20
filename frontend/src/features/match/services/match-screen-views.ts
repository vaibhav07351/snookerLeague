import { summarizeMatch, type MatchSummary } from '@/features/match/services/match-summary';

import type { FrameRankView } from '@/features/match/components/FrameLiveRanks';
import type { ScoreSideView } from '@/features/match/components/MatchScoreHeader';
import type { ResultAction } from '@/features/result/components/ResultActionBar';
import type { Match } from '@/shared/types/domain';

type NameOf = (playerId: string) => string;

/** The live frame's per-player points (short names). Empty when no frame is open. */
export function liveFrameRanks(
  match: Match | null | undefined,
  shortName: NameOf,
): FrameRankView[] {
  if (!match?.openFrame) {
    return [];
  }
  return summarizeMatch({ ...match, frames: [] }, true).players.map((p) => ({
    playerId: p.playerId,
    name: shortName(p.playerId),
    side: p.side,
    scored: p.scored,
    foulPoints: p.foulPoints,
    highestBreak: p.highestBreak,
  }));
}

/** One side of the score header: frames won, points in the live (or last) frame, its players. */
export function scoreSideView(
  match: Match,
  side: 'a' | 'b',
  shortName: NameOf,
  liveRanks: FrameRankView[],
  summary: MatchSummary | null | undefined,
): ScoreSideView {
  const open = match.openFrame ?? null;
  const ids = side === 'a' ? match.teamA : match.teamB;
  const last = match.frames[match.frames.length - 1];
  const live = open ? (side === 'a' ? open.teamAPoints : open.teamBPoints) : null;
  const lastPts = side === 'a' ? (last?.teamAPoints ?? 0) : (last?.teamBPoints ?? 0);
  const livePoints = new Map(liveRanks.map((r) => [r.playerId, r.scored]));
  const hbByPlayer = new Map(summary?.players.map((p) => [p.playerId, p.highestBreak]) ?? []);
  return {
    side,
    framePoints: live ?? lastPts,
    frames: side === 'a' ? match.outcome.framesA : match.outcome.framesB,
    players: ids.map((pid) => ({
      id: pid,
      name: shortName(pid),
      framePoints: livePoints.get(pid) ?? 0,
      highestBreak: hbByPlayer.get(pid) ?? 0,
    })),
  };
}

/** The buttons under a match: Rematch (when offered), Frames, and More for whoever runs it. */
export function matchBarActions(input: {
  match: Match;
  finished: boolean;
  canRematch: boolean;
  canOpenMore: boolean;
  busy: boolean;
  onRematch: () => void;
  onFrames: () => void;
  onMore: () => void;
}): ResultAction[] {
  const { match, finished } = input;
  const actions: ResultAction[] = [];
  if (input.canRematch) {
    actions.push({
      key: 'rematch',
      label: 'Rematch',
      icon: 'refresh',
      disabled: input.busy,
      onPress: input.onRematch,
    });
  }
  actions.push({
    key: 'frames',
    // Finished, the short label keeps four buttons on one line on the narrowest phones.
    label: !finished && match.frames.length > 0 ? `Frames (${match.frames.length})` : 'Frames',
    icon: 'list-outline',
    onPress: input.onFrames,
  });
  if (input.canOpenMore) {
    actions.push({
      key: 'more',
      label: 'More',
      icon: 'ellipsis-horizontal',
      onPress: input.onMore,
    });
  }
  return actions;
}
