import type { GroupFrame, GroupShot } from '@/shared/types/domain';
import { nextInTurn } from '@/shared/utils/turn-order';

/** Points per player id. */
export type PointsByPlayer = Record<string, number>;

export function zeroPoints(playerIds: readonly string[]): PointsByPlayer {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

/**
 * A foul in free-for-all: the fouler loses the foul value, but never goes below zero. Whatever
 * they cannot pay is added to every other player, so the fouler always ends up exactly `value`
 * further behind each opponent. Example: on 4, foul 6: fouler to 0, everyone else +2.
 */
export function applyFoul(points: PointsByPlayer, foulerId: string, value: number): PointsByPlayer {
  const own = points[foulerId] ?? 0;
  const paid = Math.min(own, value);
  const shortfall = value - paid;
  const next: PointsByPlayer = {};
  for (const [id, pts] of Object.entries(points)) {
    next[id] = id === foulerId ? pts - paid : pts + shortfall;
  }
  return next;
}

export interface GroupFrameScore {
  points: PointsByPlayer;
  /** Points in the visit still running, and whose visit it is. */
  currentBreak: number;
  breakPlayerId: string | null;
  /** Foul value each player has committed this frame (what the fouls cost, before any cap). */
  foulPoints: PointsByPlayer;
}

/** Replay a frame's shots into per-player points. Pure: undo is just dropping the last shot. */
export function replayGroupFrame(
  shots: readonly GroupShot[],
  playerIds: readonly string[],
): GroupFrameScore {
  let points = zeroPoints(playerIds);
  const foulPoints = zeroPoints(playerIds);
  let currentBreak = 0;
  let breakPlayerId: string | null = null;
  for (const shot of shots) {
    if (!(shot.playerId in points)) {
      continue;
    }
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      points = { ...points, [shot.playerId]: (points[shot.playerId] ?? 0) + shot.points };
      currentBreak = breakPlayerId === shot.playerId ? currentBreak + shot.points : shot.points;
      breakPlayerId = shot.playerId;
    } else {
      if (shot.kind === 'foul') {
        points = applyFoul(points, shot.playerId, shot.points);
        foulPoints[shot.playerId] = (foulPoints[shot.playerId] ?? 0) + shot.points;
      }
      currentBreak = 0;
      breakPlayerId = null;
    }
  }
  return { points, currentBreak, breakPlayerId, foulPoints };
}

/** Who plays after `shot`: a pot keeps the shooter at the table, anything else passes it on. */
export function atTableAfter(
  shot: GroupShot,
  turnOrder: readonly string[],
  playerIds: readonly string[],
): string {
  if (shot.kind === 'pot' || shot.kind === 'free_ball') {
    return shot.playerId;
  }
  return nextInTurn(turnOrder, playerIds, shot.playerId) ?? shot.playerId;
}

/** Players sharing the top score (one id unless the frame is tied). */
export function frameLeaders(points: PointsByPlayer): string[] {
  const entries = Object.entries(points);
  if (entries.length === 0) {
    return [];
  }
  const top = Math.max(...entries.map(([, pts]) => pts));
  return entries.filter(([, pts]) => pts === top).map(([id]) => id);
}

/** Each scoring visit in order: consecutive pots by one player. */
export function groupVisitBreaks(
  shots: readonly GroupShot[],
): { playerId: string; value: number }[] {
  const visits: { playerId: string; value: number }[] = [];
  let current: { playerId: string; value: number } | null = null;
  for (const shot of shots) {
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      if (current && current.playerId === shot.playerId) {
        current.value += shot.points;
      } else {
        if (current) {
          visits.push(current);
        }
        current = { playerId: shot.playerId, value: shot.points };
      }
    } else if (current) {
      visits.push(current);
      current = null;
    }
  }
  if (current) {
    visits.push(current);
  }
  return visits;
}

/** Highest break per player in one frame. */
export function highestBreaksOf(shots: readonly GroupShot[]): PointsByPlayer {
  const best: PointsByPlayer = {};
  for (const visit of groupVisitBreaks(shots)) {
    best[visit.playerId] = Math.max(best[visit.playerId] ?? 0, visit.value);
  }
  return best;
}

/** Breaks rotate round the table: the next frame is broken by the player after the last breaker. */
export function nextBreakerId(
  frames: readonly GroupFrame[],
  turnOrder: readonly string[],
  playerIds: readonly string[],
): string | null {
  const last = frames[frames.length - 1];
  if (!last?.breakerId) {
    return turnOrder[0] ?? playerIds[0] ?? null;
  }
  return nextInTurn(turnOrder, playerIds, last.breakerId);
}

export interface GroupStandingRow {
  playerId: string;
  framesWon: number;
  /** Points over all finished frames, used to split equal frame counts on the table. */
  points: number;
}

/** Frames won and total points per player, best first. */
export function groupStandings(
  frames: readonly GroupFrame[],
  playerIds: readonly string[],
): GroupStandingRow[] {
  const rows = new Map<string, GroupStandingRow>(
    playerIds.map((id) => [id, { playerId: id, framesWon: 0, points: 0 }]),
  );
  for (const frame of frames) {
    const winner = rows.get(frame.winnerId);
    if (winner) {
      winner.framesWon += 1;
    }
    for (const [id, pts] of Object.entries(frame.points)) {
      const row = rows.get(id);
      if (row) {
        row.points += pts;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.framesWon - a.framesWon || b.points - a.points);
}

/**
 * The match winner once decided, else null. A player wins as soon as nobody can catch them in
 * the frames left. If the planned frames are used up with players level on frames, deciders
 * are played until one player is ahead on their own.
 */
export function groupMatchWinner(
  frames: readonly GroupFrame[],
  bestOf: number,
  playerIds: readonly string[],
): string | null {
  const [first, second] = groupStandings(frames, playerIds);
  if (!first) {
    return null;
  }
  const remaining = Math.max(0, bestOf - frames.length);
  const chaser = second?.framesWon ?? 0;
  return first.framesWon > chaser + remaining ? first.playerId : null;
}
