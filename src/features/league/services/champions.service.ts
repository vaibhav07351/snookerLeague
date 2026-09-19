import { getStore, loadStore } from '@/shared/storage/local-store';
import type { Match, Race } from '@/shared/types/domain';
import { matchFormatOf } from '@/features/match/services/match.service';

export interface TeamChampionRecord {
  kind: 'team';
  matchId: string;
  crownedAt: string;
  playerIds: string[];
  namedLabel: string | null;
  scoreLine: string;
  viaForfeit: boolean;
  isCurrent: boolean;
  format: 'singles' | 'doubles';
}

export interface RaceChampionRecord {
  kind: 'race';
  raceId: string;
  crownedAt: string;
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
        crownedAt: m.updatedAt,
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
        crownedAt,
        playerId: first?.playerId ?? '',
        namedLabel: r.namedLabel,
        targetScore: r.targetScore,
        isCurrent: currentRaceId === r.id,
      };
    })
    .filter((row) => row.playerId.length > 0)
    .sort((a, b) => b.crownedAt.localeCompare(a.crownedAt));
}
