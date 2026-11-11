import { getStore, loadStore } from '@/shared/storage/local-store';
import { matchPlayedAt, type Match, type MatchFormat, type Race } from '@/shared/types/domain';
import { matchFormatOf } from '@/features/match/services/match.service';
import { raceDurationSeconds } from '@/features/race/services/race.service';
import { totalFrameSeconds } from '@/shared/utils/frame-time';

export interface TeamChampionRecord {
  kind: 'team';
  matchId: string;
  /** When the title match was started. */
  startedAt: string;
  crownedAt: string;
  /** Total of the timed frames; null when no frame was timed. */
  durationSeconds: number | null;
  playerIds: string[];
  namedLabel: string | null;
  scoreLine: string;
  viaForfeit: boolean;
  isCurrent: boolean;
  format: MatchFormat;
}

export interface RaceChampionRecord {
  kind: 'race';
  raceId: string;
  /** When the crowning race was started. */
  startedAt: string;
  crownedAt: string;
  durationSeconds: number | null;
  playerId: string;
  namedLabel: string | null;
  targetScore: number;
  isCurrent: boolean;
}

function scoreLineFor(match: Match): string {
  if (match.outcome.status === 'in_progress') {
    return `${match.outcome.framesA}–${match.outcome.framesB}`;
  }
  return `${match.outcome.framesA}–${match.outcome.framesB}`;
}

/** Doubles title matches that crowned a team, newest first. */
export async function listTeamChampionHistory(leagueId: string): Promise<TeamChampionRecord[]> {
  await loadStore();
  const store = getStore();
  const league = store.leagues.find((l) => l.id === leagueId);
  const currentMatchId = league?.reigningTeam?.matchId ?? null;

  return store.matches
    .filter((m) => m.leagueId === leagueId && m.crownsChampion)
    .filter((m) => m.outcome.status === 'completed' || m.outcome.status === 'forfeited')
    .map((m) => {
      const winnerIds =
        m.outcome.status === 'in_progress' ? m.teamA : m.outcome.winner === 'a' ? m.teamA : m.teamB;
      return {
        kind: 'team' as const,
        matchId: m.id,
        startedAt: m.createdAt,
        crownedAt: matchPlayedAt(m),
        durationSeconds: totalFrameSeconds(m.frames),
        playerIds: winnerIds,
        namedLabel: m.namedLabel,
        scoreLine: scoreLineFor(m),
        viaForfeit: m.outcome.status === 'forfeited',
        isCurrent: currentMatchId === m.id,
        format: matchFormatOf(m),
      };
    })
    .sort((a, b) => b.crownedAt.localeCompare(a.crownedAt));
}

/** Race-to-score crowning races, newest first. */
export async function listRaceChampionHistory(leagueId: string): Promise<RaceChampionRecord[]> {
  await loadStore();
  const store = getStore();
  const league = store.leagues.find((l) => l.id === leagueId);
  const currentRaceId = league?.raceKing?.raceId ?? null;

  return store.races
    .filter((r) => r.leagueId === leagueId && r.crownsRaceChampion)
    .filter((r) => r.status === 'completed')
    .map((r: Race) => {
      const first = r.entrants.find((e) => e.place === 1);
      const crownedAt = first?.finishedAt ?? r.updatedAt;
      return {
        kind: 'race' as const,
        raceId: r.id,
        startedAt: r.createdAt,
        crownedAt,
        durationSeconds: raceDurationSeconds(r),
        playerId: first?.playerId ?? '',
        namedLabel: r.namedLabel,
        targetScore: r.targetScore,
        isCurrent: currentRaceId === r.id,
      };
    })
    .filter((row) => row.playerId.length > 0)
    .sort((a, b) => b.crownedAt.localeCompare(a.crownedAt));
}
