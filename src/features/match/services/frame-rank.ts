import type { FrameScore, Shot } from '@/shared/types/domain';

export interface FramePlayerRank {
  playerId: string;
  points: number;
  scored: number;
  foulPoints: number;
  place: number;
}

export interface PlayerShotTotals {
  scored: number;
  fouls: number;
  foulPoints: number;
  net: number;
}

function emptyTotals(): PlayerShotTotals {
  return { scored: 0, fouls: 0, foulPoints: 0, net: 0 };
}

export function playerShotTotals(
  shots: Shot[],
  teams: { a: string[]; b: string[] },
): Record<string, PlayerShotTotals> {
  const totals: Record<string, PlayerShotTotals> = {};
  for (const id of [...teams.a, ...teams.b]) {
    totals[id] = emptyTotals();
  }
  const lastBySide: { a: string | null; b: string | null } = { a: null, b: null };

  function resolve(side: 'a' | 'b', shotPlayerId: string | null): string | null {
    return shotPlayerId ?? lastBySide[side] ?? (side === 'a' ? teams.a[0] : teams.b[0]) ?? null;
  }

  for (const shot of shots) {
    if (shot.playerId) {
      lastBySide[shot.side] = shot.playerId;
    }
    const pid = resolve(shot.side, shot.playerId ?? null);
    if (!pid || totals[pid] === undefined) {
      continue;
    }
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      totals[pid].scored += shot.points;
      lastBySide[shot.side] = pid;
    } else if (shot.kind === 'foul') {
      totals[pid].fouls += 1;
      totals[pid].foulPoints += shot.points;
    }
  }

  for (const id of Object.keys(totals)) {
    const row = totals[id];
    if (!row) {
      continue;
    }
    row.net = row.scored - row.foulPoints;
  }
  return totals;
}

export function framePlayerPoints(
  shots: Shot[],
  teams: { a: string[]; b: string[] },
): Record<string, number> {
  const totals = playerShotTotals(shots, teams);
  const points: Record<string, number> = {};
  for (const id of Object.keys(totals)) {
    points[id] = totals[id]?.net ?? 0;
  }
  return points;
}

function rankFromTotals(
  playerIds: string[],
  totals: Record<string, PlayerShotTotals>,
): FramePlayerRank[] {
  const uniqueIds = [...new Set(playerIds)];
  return uniqueIds
    .map((playerId, index) => {
      const row = totals[playerId];
      return {
        playerId,
        scored: row?.scored ?? 0,
        foulPoints: row?.foulPoints ?? 0,
        points: row?.net ?? 0,
        index,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      return a.index - b.index;
    })
    .map((row, i) => ({
      playerId: row.playerId,
      points: row.points,
      scored: row.scored,
      foulPoints: row.foulPoints,
      place: i + 1,
    }));
}

function totalsForManualSingles(
  frame: FrameScore,
  teams: { a: string[]; b: string[] },
): Record<string, PlayerShotTotals> | null {
  if (teams.a.length !== 1 || teams.b.length !== 1) {
    return null;
  }
  const a = teams.a[0];
  const b = teams.b[0];
  if (!a || !b) {
    return null;
  }
  return {
    [a]: { scored: frame.teamAPoints, fouls: 0, foulPoints: 0, net: frame.teamAPoints },
    [b]: { scored: frame.teamBPoints, fouls: 0, foulPoints: 0, net: frame.teamBPoints },
  };
}

export function playerTotalsForFrame(
  frame: FrameScore,
  teams: { a: string[]; b: string[] },
): Record<string, PlayerShotTotals> {
  const shots = frame.shots ?? [];
  if (shots.length > 0) {
    return playerShotTotals(shots, teams);
  }
  return totalsForManualSingles(frame, teams) ?? {};
}

export function rankFramePlayers(
  shots: Shot[],
  playerIds: string[],
  teams: { a: string[]; b: string[] },
): FramePlayerRank[] {
  return rankFromTotals(playerIds, playerShotTotals(shots, teams));
}

/** Per-player points for one finished frame (shots, or singles team score). */
export function rankPlayersForFrame(
  frame: FrameScore,
  playerIds: string[],
  teams: { a: string[]; b: string[] },
): FramePlayerRank[] {
  const shots = frame.shots ?? [];
  if (shots.length === 0 && (teams.a.length !== 1 || teams.b.length !== 1)) {
    return [];
  }
  return rankFromTotals(playerIds, playerTotalsForFrame(frame, teams));
}

/** Match totals across every frame. */
export function rankMatchPlayers(
  frames: FrameScore[],
  playerIds: string[],
  teams: { a: string[]; b: string[] },
): FramePlayerRank[] {
  const uniqueIds = [...new Set(playerIds)];
  const totals: Record<string, PlayerShotTotals> = {};
  for (const id of uniqueIds) {
    totals[id] = emptyTotals();
  }
  for (const frame of frames) {
    const part = playerTotalsForFrame(frame, teams);
    for (const id of uniqueIds) {
      const into = totals[id];
      const add = part[id];
      if (!into || !add) {
        continue;
      }
      into.scored += add.scored;
      into.fouls += add.fouls;
      into.foulPoints += add.foulPoints;
      into.net = into.scored - into.foulPoints;
    }
  }
  return rankFromTotals(uniqueIds, totals);
}
