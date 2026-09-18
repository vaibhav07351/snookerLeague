import type { Match, Player, Race } from '@/shared/types/domain';
import { colors } from '@/theme/tokens';

export interface PlayerInsights {
  player: Player;
  totalGames: number;
  doublesPlayed: number;
  doublesWins: number;
  doublesLosses: number;
  /** Clean losses (not via forfeit). */
  cleanLosses: number;
  doublesWinPct: number;
  forfeits: number;
  winsByForfeit: number;
  racesPlayed: number;
  raceFirsts: number;
  racePodiums: number;
  raceFirstPct: number;
  avgRacePlace: number | null;
  currentDoublesStreak: number;
  currentRaceFirstStreak: number;
  titles: number;
  lastPlayedAt: string | null;
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
  /** 1 = win, 0 = loss, -1 = forfeit loss */
  form: number[];
  placeBars: Array<{ label: string; value: number; color: string }>;
  resultDonut: Array<{ label: string; value: number; color: string }>;
  activityBars: Array<{ label: string; value: number; color: string }>;
  /** Avg win vs avg loss frame length (minutes, for bar chart). */
  paceBars: Array<{ label: string; value: number; color: string }>;
}

function playerSide(match: Match, playerId: string): 'a' | 'b' | null {
  if (match.teamA.includes(playerId)) {
    return 'a';
  }
  if (match.teamB.includes(playerId)) {
    return 'b';
  }
  return null;
}

function matchFormValue(match: Match, playerId: string): number | null {
  if (match.outcome.status === 'in_progress') {
    return null;
  }
  const side = playerSide(match, playerId);
  if (!side) {
    return null;
  }
  if (match.outcome.status === 'forfeited' && match.outcome.forfeitedBy === side) {
    return -1;
  }
  return match.outcome.winner === side ? 1 : 0;
}

function timingFromStats(player: Player): {
  timedFrames: number;
  totalFrameSeconds: number;
  avgFrameSeconds: number | null;
  avgWinFrameSeconds: number | null;
  avgLossFrameSeconds: number | null;
  fastestFrameSeconds: number | null;
  slowestFrameSeconds: number | null;
  winPaceDeltaSeconds: number | null;
} {
  const s = player.stats.standard;
  const timedFrames = s.timedFrames ?? 0;
  const totalFrameSeconds = s.totalFrameSeconds ?? 0;
  const avgFrameSeconds = s.avgFrameSeconds ?? null;
  const avgWinFrameSeconds = s.avgWinFrameSeconds ?? null;
  const avgLossFrameSeconds = s.avgLossFrameSeconds ?? null;
  const fastestFrameSeconds = s.fastestFrameSeconds ?? null;
  const slowestFrameSeconds = s.slowestFrameSeconds ?? null;
  const winPaceDeltaSeconds =
    avgWinFrameSeconds != null && avgLossFrameSeconds != null
      ? avgLossFrameSeconds - avgWinFrameSeconds
      : null;
  return {
    timedFrames,
    totalFrameSeconds,
    avgFrameSeconds,
    avgWinFrameSeconds,
    avgLossFrameSeconds,
    fastestFrameSeconds,
    slowestFrameSeconds,
    winPaceDeltaSeconds,
  };
}

export function buildPlayerInsights(
  player: Player,
  matches: Match[],
  races: Race[],
): PlayerInsights {
  const doubles = matches
    .filter((m) => m.leagueId === player.leagueId)
    .filter((m) => m.teamA.includes(player.id) || m.teamB.includes(player.id))
    .filter((m) => m.outcome.status !== 'in_progress')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  const raceList = races
    .filter((r) => r.leagueId === player.leagueId)
    .filter((r) => r.status === 'completed')
    .filter((r) => r.entrants.some((e) => e.playerId === player.id))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  const form: number[] = [];
  for (const m of doubles.slice(-10)) {
    const value = matchFormValue(m, player.id);
    if (value != null) {
      form.push(value);
    }
  }
  for (const r of raceList.slice(-10)) {
    const place = r.entrants.find((e) => e.playerId === player.id)?.place;
    if (typeof place === 'number') {
      form.push(place === 1 ? 1 : 0);
    }
  }
  const clippedForm = form.slice(-12);

  const s = player.stats.standard;
  const r = player.stats.race;
  const forfeits = s.forfeits ?? 0;
  const winsByForfeit = s.winsByForfeit ?? 0;
  const doublesLosses = Math.max(s.played - s.wins, 0);
  const cleanLosses = Math.max(doublesLosses - forfeits, 0);
  const podiums = r.firsts + r.seconds + r.thirds;
  const lastCandidates = [s.lastPlayedAt, r.lastPlayedAt].filter(Boolean) as string[];
  const lastPlayedAt =
    lastCandidates.length > 0 ? (lastCandidates.sort().at(-1) ?? null) : null;
  const timing = timingFromStats(player);

  const paceBars: Array<{ label: string; value: number; color: string }> = [];
  if (timing.avgWinFrameSeconds != null) {
    paceBars.push({
      label: 'Win',
      value: Math.max(1, Math.round(timing.avgWinFrameSeconds / 60)),
      color: colors.mint,
    });
  }
  if (timing.avgLossFrameSeconds != null) {
    paceBars.push({
      label: 'Loss',
      value: Math.max(1, Math.round(timing.avgLossFrameSeconds / 60)),
      color: colors.coral,
    });
  }
  if (timing.avgFrameSeconds != null) {
    paceBars.push({
      label: 'Avg',
      value: Math.max(1, Math.round(timing.avgFrameSeconds / 60)),
      color: colors.gold,
    });
  }

  return {
    player,
    totalGames: s.played + r.played,
    doublesPlayed: s.played,
    doublesWins: s.wins,
    doublesLosses,
    cleanLosses,
    doublesWinPct: s.winPct,
    forfeits,
    winsByForfeit,
    racesPlayed: r.played,
    raceFirsts: r.firsts,
    racePodiums: podiums,
    raceFirstPct: r.firstPct,
    avgRacePlace: r.avgPlace,
    currentDoublesStreak: s.streak,
    currentRaceFirstStreak: r.firstStreak,
    titles: s.titles + r.titles,
    lastPlayedAt,
    ...timing,
    form: clippedForm,
    placeBars: [
      { label: '1st', value: r.firsts, color: colors.gold },
      { label: '2nd', value: r.seconds, color: colors.sky },
      { label: '3rd', value: r.thirds, color: colors.lavender },
      {
        label: '4+',
        value: Math.max(r.played - podiums, 0),
        color: colors.coral,
      },
    ],
    resultDonut: [
      { label: 'Wins', value: s.wins, color: colors.mint },
      { label: 'Losses', value: cleanLosses, color: colors.sky },
      { label: 'Forfeits', value: forfeits, color: colors.coral },
    ],
    activityBars: [
      { label: 'Doubles', value: s.played, color: colors.mint },
      { label: 'Races', value: r.played, color: colors.sky },
      { label: 'Titles', value: s.titles + r.titles, color: colors.gold },
      { label: 'Forfeits', value: forfeits, color: colors.coral },
    ],
    paceBars,
  };
}

export function buildLeagueActivity(
  players: Player[],
): Array<{ label: string; value: number; color: string }> {
  const palette = [colors.gold, colors.mint, colors.sky, colors.coral, colors.lavender, colors.sun];
  return [...players]
    .map((p) => ({
      label: p.displayName.split(' ')[0] ?? p.displayName,
      value: p.stats.standard.played + p.stats.race.played,
      player: p,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((row, i) => ({
      label: row.label.slice(0, 8),
      value: row.value,
      color: palette[i % palette.length]!,
    }));
}

export function buildLeagueForfeitBoard(
  players: Player[],
): Array<{ label: string; value: number; color: string }> {
  return [...players]
    .map((p) => ({
      label: (p.displayName.split(' ')[0] ?? p.displayName).slice(0, 8),
      value: p.stats.standard.forfeits ?? 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((row) => ({ ...row, color: colors.coral }));
}

/** League pace: avg frame minutes (sorted quickest first). */
export function buildLeaguePaceBoard(
  players: Player[],
): Array<{ label: string; value: number; color: string }> {
  const palette = [colors.mint, colors.sky, colors.gold, colors.sun, colors.coral, colors.lavender];
  return [...players]
    .filter(
      (p) => (p.stats.standard.timedFrames ?? 0) > 0 && p.stats.standard.avgFrameSeconds != null,
    )
    .map((p) => ({
      label: (p.displayName.split(' ')[0] ?? p.displayName).slice(0, 8),
      value: Math.max(1, Math.round((p.stats.standard.avgFrameSeconds ?? 0) / 60)),
      avg: p.stats.standard.avgFrameSeconds ?? 0,
    }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 6)
    .map((row, i) => ({
      label: row.label,
      value: row.value,
      color: palette[i % palette.length]!,
    }));
}

/** Total table time in minutes of timed frames by player. */
export function buildLeagueTableTimeBoard(
  players: Player[],
): Array<{ label: string; value: number; color: string }> {
  const palette = [colors.gold, colors.mint, colors.sky, colors.coral, colors.lavender, colors.sun];
  return [...players]
    .filter((p) => (p.stats.standard.totalFrameSeconds ?? 0) > 0)
    .map((p) => ({
      label: (p.displayName.split(' ')[0] ?? p.displayName).slice(0, 8),
      value: Math.max(1, Math.round((p.stats.standard.totalFrameSeconds ?? 0) / 60)),
      raw: p.stats.standard.totalFrameSeconds ?? 0,
    }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 6)
    .map((row, i) => ({
      label: row.label,
      value: row.value,
      color: palette[i % palette.length]!,
    }));
}
