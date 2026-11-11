/** Misses and safeties one player played. */
export interface TurnEndTally {
  misses: number;
  safeties: number;
}

/** Any shot log entry that names its player (race and free-for-all shots both do). */
export interface TalliedShot {
  playerId: string;
  kind: string;
}

export function emptyTurnEndTally(): TurnEndTally {
  return { misses: 0, safeties: 0 };
}

/** Misses and safeties per player id, in one pass over the shot log. */
export function tallyTurnEnds(shots: readonly TalliedShot[]): Record<string, TurnEndTally> {
  const byPlayer: Record<string, TurnEndTally> = {};
  for (const shot of shots) {
    if (shot.kind !== 'miss' && shot.kind !== 'safety') {
      continue;
    }
    const row = byPlayer[shot.playerId] ?? emptyTurnEndTally();
    if (shot.kind === 'miss') {
      row.misses += 1;
    } else {
      row.safeties += 1;
    }
    byPlayer[shot.playerId] = row;
  }
  return byPlayer;
}
