import type { ReactNode } from 'react';

import type {
  GroupStandingRow,
  PointsByPlayer,
} from '@/features/group/services/group-frame-engine';
import { RankedList, type RankedListRow } from '@/shared/ui/RankedList';

interface GroupLiveBoardProps {
  /** Players in seat order (the playing order at the table). */
  seatOrder: string[];
  points: PointsByPlayer;
  /** Foul value each player has given away this frame. */
  foulPoints: PointsByPlayer;
  standings: GroupStandingRow[];
  nameOf: (playerId: string) => string;
}

interface Line {
  id: string;
  points: number;
  fouls: number;
  frames: number;
}

/** Most points this frame first; fewer foul points, then more frames won, settle ties. */
function compareLines(a: Line, b: Line): number {
  return b.points - a.points || a.fouls - b.fouls || b.frames - a.frames;
}

/**
 * The live frame's leaderboard, read-only and ranked, matching the two-sided match's list.
 * Picking who is at the table happens on the playing order tiles above it.
 */
export function GroupLiveBoard({
  seatOrder,
  points,
  foulPoints,
  standings,
  nameOf,
}: GroupLiveBoardProps): ReactNode {
  const framesWon = new Map(standings.map((r) => [r.playerId, r.framesWon]));
  const lines: Line[] = seatOrder
    .map((id) => ({
      id,
      points: points[id] ?? 0,
      fouls: foulPoints[id] ?? 0,
      frames: framesWon.get(id) ?? 0,
    }))
    .sort(compareLines);
  const top = lines[0]?.points ?? 0;
  const ranked = top > 0;

  const rows: RankedListRow[] = lines.map((l) => {
    // Equal points share a place, as in the two-sided match.
    const place = 1 + lines.filter((o) => o.points > l.points).length;
    return {
      id: l.id,
      place: ranked ? String(place) : '-',
      name: nameOf(l.id),
      points: l.points,
      foulPoints: l.fouls,
      leading: ranked && l.points === top,
      extra: `${l.frames} fr`,
      accessibilityLabel: `${ranked ? `Place ${place}, ` : ''}${nameOf(l.id)}, ${l.points} points, ${l.frames} frames won${
        l.fouls > 0 ? `, ${l.fouls} given away in fouls` : ''
      }`,
    };
  });

  return <RankedList rows={rows} accessibilityLabel="Frame leaderboard" />;
}
