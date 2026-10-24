import { useCallback, useState } from 'react';

import * as matchService from '@/features/match/services/match.service';
import { listPlayers } from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Match, Player, Race } from '@/shared/types/domain';

export function matchResumeCopy(
  match: Match,
  nameOf: (id: string) => string,
): { title: string; meta: string } {
  const labels = matchService.playerNamesForMatch(match, nameOf);
  const open = match.openFrame;
  const framePts = open != null ? ` · this frame ${open.teamAPoints}–${open.teamBPoints}` : '';
  return {
    title: match.namedLabel ?? `${labels.teamA} vs ${labels.teamB}`,
    meta: `Frames ${match.outcome.framesA}–${match.outcome.framesB}${framePts}`,
  };
}

export function raceResumeCopy(
  race: Race,
  nameOf: (id: string) => string,
): { title: string; meta: string } {
  const leader = [...race.entrants].sort((a, b) => b.score - a.score)[0];
  const leadLine = leader != null ? `${nameOf(leader.playerId)} ${leader.score}` : 'In progress';
  return {
    title: race.namedLabel ?? `Race to ${race.targetScore}`,
    meta: `${leadLine} · race to ${race.targetScore}`,
  };
}

export function useLiveSessions(leagueId: string | null | undefined): {
  matches: Match[];
  races: Race[];
  nameOf: (id: string) => string;
} {
  const [matches, setMatches] = useState<Match[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const reload = useCallback(async () => {
    if (!leagueId) {
      setMatches([]);
      setRaces([]);
      setPlayers([]);
      return;
    }
    const [liveMatches, liveRaces, roster] = await Promise.all([
      matchService.listLiveMatches(leagueId),
      raceService.listLiveRaces(leagueId),
      listPlayers(leagueId),
    ]);
    setMatches(liveMatches);
    setRaces(liveRaces);
    setPlayers(roster);
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? 'Player';

  return { matches, races, nameOf };
}
