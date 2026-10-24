import type { Match, Player } from '@/shared/types/domain';

/**
 * Semantic colour role for a chart datum. Services stay theme-free: the UI resolves a role
 * to the active palette (e.g. `palette.success`), so a theme switch recolours every chart.
 */
export type ChartTone =
  'primary' | 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'teamA' | 'teamB';

/** Either a meaningful role, or a categorical slot (`palette.chart[index]`) for ranked boards. */
export type ChartColorKey = { kind: 'tone'; tone: ChartTone } | { kind: 'series'; index: number };

export interface ChartDatum {
  label: string;
  value: number;
  colorKey: ChartColorKey;
}

function tone(t: ChartTone): ChartColorKey {
  return { kind: 'tone', tone: t };
}

export interface PlayerInsights {
  player: Player;
  totalGames: number;
  /** Singles and doubles matches. */
  matchesPlayed: number;
  matchWins: number;
  matchLosses: number;
  /** Clean losses (not via forfeit). */
  cleanLosses: number;
  matchWinPct: number;
  forfeits: number;
  winsByForfeit: number;
  racesPlayed: number;
  raceFirsts: number;
  racePodiums: number;
  raceFirstPct: number;
  avgRacePlace: number | null;
  currentMatchStreak: number;
  currentRaceFirstStreak: number;
  raceTitles: number;
  titles: number;
  lastPlayedAt: string | null;
  /** Frames played at the table (frames carried over from before the app are left out). */
  framesPlayed: number;
  /** Pots per frame, so heavy and light players compare fairly. Null with no frames. */
  pointsPerFrame: number | null;
  foulsPerFrame: number | null;
  /** Timed frame pace (doubles share the frame clock). */
  timedFrames: number;
  totalFrameSeconds: number;
  avgFrameSeconds: number | null;
  avgWinFrameSeconds: number | null;
  avgLossFrameSeconds: number | null;
  fastestFrameSeconds: number | null;
  slowestFrameSeconds: number | null;
  /** Seconds faster on win frames vs loss frames (null if N/A). */
  winPaceDeltaSeconds: number | null;
  highestBreak: number;
  breaks50: number;
  centuries: number;
  maximums: number;
  pointsScored: number;
  fouls: number;
  foulPoints: number;
  netPoints: number;
  placeBars: ChartDatum[];
  resultDonut: ChartDatum[];
  /** Avg win vs avg loss frame length (minutes, for bar chart). */
  paceBars: ChartDatum[];
}

function perFrame(total: number, frames: number): number | null {
  if (frames <= 0) {
    return null;
  }
  return Math.round((total / frames) * 10) / 10;
}

/** Frames this player was at the table for in finished league matches. */
function countFramesPlayed(player: Player, matches: Match[]): number {
  let frames = 0;
  for (const m of matches) {
    if (m.leagueId !== player.leagueId || m.outcome.status === 'in_progress') {
      continue;
    }
    if (!m.teamA.includes(player.id) && !m.teamB.includes(player.id)) {
      continue;
    }
    frames += m.frames.filter((f) => !f.carriedOver && !f.viaForfeit).length;
  }
  return frames;
}

/**
 * Everything a player card shows. `player.stats` must be fresh for this league (see
 * `applyPlayerStats`); `matches` is only walked for the frame count.
 */
export function buildPlayerInsights(player: Player, matches: Match[]): PlayerInsights {
  const s = player.stats.standard;
  const r = player.stats.race;
  const forfeits = s.forfeits ?? 0;
  const winsByForfeit = s.winsByForfeit ?? 0;
  const matchLosses = Math.max(s.played - s.wins, 0);
  const cleanLosses = Math.max(matchLosses - forfeits, 0);
  const podiums = r.firsts + r.seconds + r.thirds;
  const lastCandidates = [s.lastPlayedAt, r.lastPlayedAt].filter(
    (x): x is string => typeof x === 'string',
  );
  const lastPlayedAt = lastCandidates.length > 0 ? (lastCandidates.sort().at(-1) ?? null) : null;
  const framesPlayed = countFramesPlayed(player, matches);

  const avgWinFrameSeconds = s.avgWinFrameSeconds ?? null;
  const avgLossFrameSeconds = s.avgLossFrameSeconds ?? null;
  const avgFrameSeconds = s.avgFrameSeconds ?? null;
  const paceBars: ChartDatum[] = [];
  if (avgWinFrameSeconds != null) {
    paceBars.push({
      label: 'Win',
      value: Math.max(1, Math.round(avgWinFrameSeconds / 60)),
      colorKey: tone('success'),
    });
  }
  if (avgLossFrameSeconds != null) {
    paceBars.push({
      label: 'Loss',
      value: Math.max(1, Math.round(avgLossFrameSeconds / 60)),
      colorKey: tone('teamB'),
    });
  }
  if (avgFrameSeconds != null) {
    paceBars.push({
      label: 'Avg',
      value: Math.max(1, Math.round(avgFrameSeconds / 60)),
      colorKey: tone('primary'),
    });
  }

  return {
    player,
    totalGames: s.played + r.played,
    matchesPlayed: s.played,
    matchWins: s.wins,
    matchLosses,
    cleanLosses,
    matchWinPct: s.winPct,
    forfeits,
    winsByForfeit,
    racesPlayed: r.played,
    raceFirsts: r.firsts,
    racePodiums: podiums,
    raceFirstPct: r.firstPct,
    avgRacePlace: r.avgPlace,
    currentMatchStreak: s.streak,
    currentRaceFirstStreak: r.firstStreak,
    raceTitles: r.titles,
    titles: s.titles + r.titles,
    lastPlayedAt,
    framesPlayed,
    pointsPerFrame: perFrame(s.pointsScored ?? 0, framesPlayed),
    foulsPerFrame: perFrame(s.fouls ?? 0, framesPlayed),
    timedFrames: s.timedFrames ?? 0,
    totalFrameSeconds: s.totalFrameSeconds ?? 0,
    avgFrameSeconds,
    avgWinFrameSeconds,
    avgLossFrameSeconds,
    fastestFrameSeconds: s.fastestFrameSeconds ?? null,
    slowestFrameSeconds: s.slowestFrameSeconds ?? null,
    winPaceDeltaSeconds:
      avgWinFrameSeconds != null && avgLossFrameSeconds != null
        ? avgLossFrameSeconds - avgWinFrameSeconds
        : null,
    highestBreak: s.highestBreak ?? 0,
    breaks50: s.breaks50 ?? 0,
    centuries: s.centuries ?? 0,
    maximums: s.maximums ?? 0,
    pointsScored: s.pointsScored ?? 0,
    fouls: s.fouls ?? 0,
    foulPoints: s.foulPoints ?? 0,
    netPoints: s.netPoints ?? (s.pointsScored ?? 0) - (s.foulPoints ?? 0),
    placeBars: [
      { label: '1st', value: r.firsts, colorKey: tone('primary') },
      { label: '2nd', value: r.seconds, colorKey: tone('info') },
      { label: '3rd', value: r.thirds, colorKey: tone('accent') },
      {
        label: '4+',
        value: Math.max(r.played - podiums, 0),
        colorKey: tone('teamB'),
      },
    ],
    resultDonut: [
      { label: 'Wins', value: s.wins, colorKey: tone('success') },
      { label: 'Losses', value: cleanLosses, colorKey: tone('info') },
      { label: 'Forfeits', value: forfeits, colorKey: tone('danger') },
    ],
    paceBars,
  };
}
