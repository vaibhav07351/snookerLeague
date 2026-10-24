import {
  FULL_RACK_REDS,
  type FrameScore,
  type Match,
  type OpenFrame,
  type Shot,
} from '@/shared/types/domain';

/** Everything about a frame that is not derived from its shots. */
export interface FrameSeed {
  breakerSide: 'a' | 'b';
  breakerPlayerId: string | null;
  startingReds: number;
  redsRemoved: number;
  carriedPoints?: { a: number; b: number };
}

export interface Teams {
  a: string[];
  b: string[];
}

export function teamsOf(match: Match): Teams {
  return { a: match.teamA, b: match.teamB };
}

export function otherSide(side: 'a' | 'b'): 'a' | 'b' {
  return side === 'a' ? 'b' : 'a';
}

/** When a visit returns to a doubles pair, the partner who sat out comes in. */
export function incomingPartner(team: string[], lastPlayerId: string | null): string | null {
  if (team.length === 0) {
    return lastPlayerId;
  }
  if (team.length === 1) {
    return team[0] ?? lastPlayerId;
  }
  if (!lastPlayerId || !team.includes(lastPlayerId)) {
    return team[0] ?? null;
  }
  return team.find((id) => id !== lastPlayerId) ?? lastPlayerId;
}

/** Seed of an existing open frame; tolerates frames saved before seeds existed. */
export function frameSeedOf(open: OpenFrame): FrameSeed {
  const firstShot = open.shots[0];
  const breakerSide = open.breakerSide ?? firstShot?.side ?? open.atTable;
  return {
    breakerSide,
    breakerPlayerId:
      open.breakerPlayerId ??
      (open.shots.length === 0 ? (open.atTablePlayerId ?? null) : (firstShot?.playerId ?? null)),
    startingReds: open.startingReds ?? FULL_RACK_REDS,
    redsRemoved: open.redsRemoved ?? 0,
    ...(open.carriedPoints ? { carriedPoints: open.carriedPoints } : {}),
  };
}

/**
 * Rebuild the live frame from its seed and shots. Pure: the same shots always give the same
 * score, break and player at the table, which is what makes undo and sync safe.
 */
export function replayOpenFrame(shots: Shot[], seed: FrameSeed, teams: Teams): OpenFrame {
  let atTable: 'a' | 'b' = seed.breakerSide;
  let teamAPoints = seed.carriedPoints?.a ?? 0;
  let teamBPoints = seed.carriedPoints?.b ?? 0;
  let currentBreak = 0;
  let currentBreakSide: 'a' | 'b' = seed.breakerSide;
  let atTablePlayerId: string | null =
    seed.breakerPlayerId ?? incomingPartner(teams[seed.breakerSide], null);
  const lastPlayerIdBySide: { a: string | null; b: string | null } = { a: null, b: null };
  lastPlayerIdBySide[seed.breakerSide] = atTablePlayerId;

  function seatIncoming(side: 'a' | 'b'): void {
    atTablePlayerId = incomingPartner(teams[side], lastPlayerIdBySide[side]);
  }

  for (const shot of shots) {
    const playerId = shot.playerId ?? null;
    if (playerId) {
      lastPlayerIdBySide[shot.side] = playerId;
    }
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      const continuing =
        currentBreakSide === shot.side &&
        atTable === shot.side &&
        (!playerId || atTablePlayerId === playerId);
      currentBreak = continuing ? currentBreak + shot.points : shot.points;
      currentBreakSide = shot.side;
      atTable = shot.side;
      if (shot.side === 'a') {
        teamAPoints += shot.points;
      } else {
        teamBPoints += shot.points;
      }
      if (playerId) {
        atTablePlayerId = playerId;
      }
    } else if (shot.kind === 'foul') {
      const awarded = otherSide(shot.side);
      if (awarded === 'a') {
        teamAPoints += shot.points;
      } else {
        teamBPoints += shot.points;
      }
      currentBreak = 0;
      currentBreakSide = awarded;
      atTable = awarded;
      seatIncoming(awarded);
    } else {
      currentBreak = 0;
      atTable = otherSide(shot.side);
      currentBreakSide = atTable;
      seatIncoming(atTable);
    }
  }

  return {
    shots,
    teamAPoints,
    teamBPoints,
    atTable,
    currentBreak,
    currentBreakSide,
    atTablePlayerId,
    lastPlayerIdBySide,
    breakerSide: seed.breakerSide,
    breakerPlayerId: seed.breakerPlayerId,
    startingReds: seed.startingReds,
    redsRemoved: seed.redsRemoved,
    ...(seed.carriedPoints ? { carriedPoints: seed.carriedPoints } : {}),
  };
}

/** A fresh frame, broken off by `side`. */
export function newOpenFrame(side: 'a' | 'b', teams: Teams, playerId?: string | null): OpenFrame {
  return replayOpenFrame(
    [],
    {
      breakerSide: side,
      breakerPlayerId: playerId ?? incomingPartner(teams[side], null),
      startingReds: FULL_RACK_REDS,
      redsRemoved: 0,
    },
    teams,
  );
}

/**
 * Who breaks the next frame: breaks alternate between sides. Falls back to the loser of the
 * last frame for frames saved before the breaker was recorded.
 */
export function nextBreakerSide(frames: FrameScore[]): 'a' | 'b' {
  const last = frames[frames.length - 1];
  if (!last) {
    return 'a';
  }
  if (last.breakerSide) {
    return otherSide(last.breakerSide);
  }
  return otherSide(last.winner);
}

export interface VisitBreak {
  side: 'a' | 'b';
  value: number;
  playerId: string | null;
}

/** Each scoring visit (break) in order. A foul, miss or safety ends the visit. */
export function visitBreaks(shots: Shot[]): VisitBreak[] {
  const visits: VisitBreak[] = [];
  let current = 0;
  let side: 'a' | 'b' | null = null;
  let playerId: string | null = null;
  const flush = (): void => {
    if (side && current > 0) {
      visits.push({ side, value: current, playerId });
    }
    current = 0;
    side = null;
    playerId = null;
  };
  for (const shot of shots) {
    if (shot.kind === 'pot' || shot.kind === 'free_ball') {
      const shotPlayer = shot.playerId ?? null;
      if (
        side != null &&
        (side !== shot.side || (shotPlayer && playerId && shotPlayer !== playerId))
      ) {
        flush();
      }
      side = shot.side;
      if (shotPlayer) {
        playerId = shotPlayer;
      }
      current += shot.points;
    } else {
      flush();
    }
  }
  flush();
  return visits;
}

export function highestBreakFromShots(shots: Shot[], side?: 'a' | 'b'): number {
  const visits = visitBreaks(shots);
  const filtered = side ? visits.filter((v) => v.side === side) : visits;
  return filtered.reduce((max, v) => Math.max(max, v.value), 0);
}
