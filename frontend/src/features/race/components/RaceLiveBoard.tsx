import type { ReactNode } from 'react';

import {
  compareRaceBoard,
  compareUnfinished,
  foulPointsOf,
  netRaceScore,
  raceShotSummary,
} from '@/features/race/services/race-helpers';
import type { Race, RacePlace } from '@/shared/types/domain';
import { RankedList, type RankedListRow } from '@/shared/ui/RankedList';

function formatPlace(place: RacePlace | null, livePlace: number): string {
  if (place === 'dnf') {
    return 'OUT';
  }
  if (typeof place === 'number') {
    return `#${place}`;
  }
  if (livePlace === 1) {
    return '1st';
  }
  if (livePlace === 2) {
    return '2nd';
  }
  if (livePlace === 3) {
    return '3rd';
  }
  return `${livePlace}th`;
}

interface RaceLiveBoardProps {
  race: Race;
  /** Compact display name (the caller passes short names, see `shortNames`). */
  nameOf: (playerId: string) => string;
}

/**
 * The race leaderboard, read-only and ranked, matching the two-sided match's list: finishers
 * first, then players still racing by score after fouls, then anyone out. Picking who is at the
 * table happens on the playing order tiles above it.
 */
export function RaceLiveBoard({ race, nameOf }: RaceLiveBoardProps): ReactNode {
  const live = [...race.entrants].sort(compareRaceBoard);

  const livePlaces = new Map<string, number>();
  let cursor = 0;
  for (const e of live) {
    if (e.place === 'dnf') {
      continue;
    }
    cursor += 1;
    livePlaces.set(e.playerId, cursor);
  }

  const leader = live.find((e) => e.place !== 'dnf');
  const tied =
    leader?.place === null &&
    live.filter((e) => e.place === null && compareUnfinished(e, leader) === 0).length > 1;
  const hasScore = live.some((e) => e.score > 0 || foulPointsOf(e) > 0);
  // A red is worth 10 in a race, so each player's reds get their own small column.
  const shots = raceShotSummary(race.liveShots);
  const anyReds = Object.values(shots).some((s) => s.reds > 0);

  const rows: RankedListRow[] = live.map((e) => {
    const place = formatPlace(e.place, livePlaces.get(e.playerId) ?? 0);
    const score = netRaceScore(e);
    const fouls = foulPointsOf(e);
    const reds = shots[e.playerId]?.reds ?? 0;
    return {
      id: e.playerId,
      place: hasScore || e.place !== null ? place : '-',
      name: nameOf(e.playerId),
      points: score,
      foulPoints: fouls,
      extra: anyReds ? (reds > 0 ? `${reds} red` : '') : undefined,
      leading: leader?.playerId === e.playerId && hasScore && !tied,
      muted: e.place === 'dnf',
      accessibilityLabel: `${place}, ${nameOf(e.playerId)}, score ${score}, ${e.score} potted${
        fouls > 0 ? `, ${fouls} in fouls` : ''
      }${reds > 0 ? `, ${reds} ${reds === 1 ? 'red' : 'reds'}` : ''}`,
    };
  });

  return (
    <RankedList
      rows={rows}
      accessibilityLabel={race.status === 'in_progress' ? 'Live race leaderboard' : 'Final score'}
    />
  );
}
