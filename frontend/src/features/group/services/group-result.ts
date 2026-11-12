import {
  groupMatchShots,
  type GroupStandingRow,
} from '@/features/group/services/group-frame-engine';
import { breakNote, countLabel, presentLines } from '@/features/result/services/result-view';
import type { ResultView } from '@/features/result/types/result.types';
import type { GroupMatch } from '@/shared/types/domain';

/** The result card of a finished free-for-all; null while it is still being played. */
export function groupResultView(
  group: GroupMatch,
  standings: readonly GroupStandingRow[],
  nameOf: (playerId: string) => string,
): ResultView | null {
  if (group.status !== 'completed') {
    return null;
  }
  // The winner leads even when only a tie-break put them ahead of an equal row.
  const ordered = [
    ...standings.filter((r) => r.playerId === group.winnerId),
    ...standings.filter((r) => r.playerId !== group.winnerId),
  ];
  const rows = ordered.map((r, i) => ({
    place: String(i + 1),
    name: nameOf(r.playerId),
    detail: `${countLabel(r.framesWon, 'frame', 'frames')} · ${r.points} pts`,
    winner: r.playerId === group.winnerId,
  }));
  const winner = ordered.find((r) => r.playerId === group.winnerId) ?? null;
  const best = Object.values(groupMatchShots(group.frames)).reduce(
    (max, s) => Math.max(max, s.highestBreak),
    0,
  );
  const caption = `${group.playerIds.length} players · best of ${group.bestOf}`;
  const winnerLabel = winner ? nameOf(winner.playerId) : null;
  return {
    kind: 'group',
    id: group.id,
    kicker: 'Free-for-all complete',
    label: group.namedLabel || 'Free-for-all',
    caption,
    mood: 'win',
    live: false,
    score: winner ? String(winner.framesWon) : '-',
    scoreUnit: winner?.framesWon === 1 ? 'frame' : 'frames',
    winnerLabel,
    winnerHeading: 'Winner',
    sides: null,
    standings: rows,
    notes: presentLines([breakNote(best)]),
    summary: winnerLabel
      ? `${winnerLabel} wins ${group.namedLabel || 'the free-for-all'}`
      : group.namedLabel || 'Free-for-all',
  };
}
