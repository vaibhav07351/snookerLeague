import { playerShotTotals } from '@/features/match/services/frame-rank';
import { visitBreaks, type Teams } from '@/features/match/services/frame-engine';
import type { FrameScore, Match, Shot } from '@/shared/types/domain';

export interface PlayerMatchLine {
  playerId: string;
  side: 'a' | 'b';
  /** Points this player potted (pots + free balls). */
  scored: number;
  fouls: number;
  foulPoints: number;
  highestBreak: number;
}

export interface TopBreak {
  playerId: string | null;
  side: 'a' | 'b';
  value: number;
}

export interface MatchSummary {
  players: PlayerMatchLine[];
  /** Frame points per side across every frame (including points carried in mid-frame). */
  totalPointsA: number;
  totalPointsB: number;
  topBreak: TopBreak | null;
  /** Sum of timed frame durations, null when no frame was timed. */
  totalSeconds: number | null;
}

function sideOf(teams: Teams, playerId: string): 'a' | 'b' {
  return teams.a.includes(playerId) ? 'a' : 'b';
}

/** Resolve who a visit belongs to: tagged player, or the only player on a singles side. */
function visitOwner(teams: Teams, side: 'a' | 'b', playerId: string | null): string | null {
  if (playerId) {
    return playerId;
  }
  const roster = teams[side];
  return roster.length === 1 ? (roster[0] ?? null) : null;
}

function addShots(
  lines: Map<string, PlayerMatchLine>,
  teams: Teams,
  shots: Shot[],
  top: { current: TopBreak | null },
): void {
  const totals = playerShotTotals(shots, teams);
  for (const [playerId, t] of Object.entries(totals)) {
    const line = lines.get(playerId);
    if (!line) {
      continue;
    }
    line.scored += t.scored;
    line.fouls += t.fouls;
    line.foulPoints += t.foulPoints;
  }
  for (const visit of visitBreaks(shots)) {
    const owner = visitOwner(teams, visit.side, visit.playerId);
    if (owner) {
      const line = lines.get(owner);
      if (line && visit.value > line.highestBreak) {
        line.highestBreak = visit.value;
      }
    }
    if (!top.current || visit.value > top.current.value) {
      top.current = { playerId: owner, side: visit.side, value: visit.value };
    }
  }
}

/** Points scored by players in frames logged by final score only (singles: the side's score). */
function addManualFrame(
  lines: Map<string, PlayerMatchLine>,
  teams: Teams,
  frame: FrameScore,
): void {
  if (teams.a.length !== 1 || teams.b.length !== 1) {
    return;
  }
  const a = lines.get(teams.a[0]!);
  const b = lines.get(teams.b[0]!);
  if (a) {
    a.scored += frame.teamAPoints;
  }
  if (b) {
    b.scored += frame.teamBPoints;
  }
}

/**
 * Whole-match totals. Pass `includeOpenFrame` for live views so the frame in progress counts.
 * Pure: derived only from the match document.
 */
export function summarizeMatch(match: Match, includeOpenFrame = false): MatchSummary {
  const teams: Teams = { a: match.teamA, b: match.teamB };
  const lines = new Map<string, PlayerMatchLine>();
  for (const playerId of [...match.teamA, ...match.teamB]) {
    lines.set(playerId, {
      playerId,
      side: sideOf(teams, playerId),
      scored: 0,
      fouls: 0,
      foulPoints: 0,
      highestBreak: 0,
    });
  }

  const top: { current: TopBreak | null } = { current: null };
  let totalPointsA = 0;
  let totalPointsB = 0;
  let totalSeconds: number | null = null;

  for (const frame of match.frames) {
    totalPointsA += frame.teamAPoints;
    totalPointsB += frame.teamBPoints;
    if (typeof frame.durationSeconds === 'number') {
      totalSeconds = (totalSeconds ?? 0) + frame.durationSeconds;
    }
    const shots = frame.shots ?? [];
    if (shots.length > 0) {
      addShots(lines, teams, shots, top);
    } else if (!frame.carriedOver) {
      addManualFrame(lines, teams, frame);
    }
  }

  const open = match.openFrame;
  if (includeOpenFrame && open) {
    totalPointsA += open.teamAPoints;
    totalPointsB += open.teamBPoints;
    addShots(lines, teams, open.shots, top);
  }

  return {
    players: [...lines.values()],
    totalPointsA,
    totalPointsB,
    topBreak: top.current,
    totalSeconds,
  };
}
