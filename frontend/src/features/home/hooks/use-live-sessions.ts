import { useCallback, useState } from 'react';

import { replayGroupFrame } from '@/features/group/services/group-frame-engine';
import * as groupService from '@/features/group/services/group.service';
import { splitByStaleness } from '@/features/home/services/live-staleness';
import * as matchService from '@/features/match/services/match.service';
import { listPlayers } from '@/features/players/services/players.service';
import { compareRaceBoard, netRaceScore } from '@/features/race/services/race-helpers';
import * as raceService from '@/features/race/services/race.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { GroupMatch, Match, Player, Race } from '@/shared/types/domain';

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
  const leader = [...race.entrants].sort(compareRaceBoard)[0];
  const leadLine =
    leader != null ? `${nameOf(leader.playerId)} ${netRaceScore(leader)}` : 'In progress';
  return {
    title: race.namedLabel ?? `Race to ${race.targetScore}`,
    meta: `${leadLine} · race to ${race.targetScore}`,
  };
}

export function groupResumeCopy(
  group: GroupMatch,
  nameOf: (id: string) => string,
): { title: string; meta: string } {
  const points = group.openFrame
    ? replayGroupFrame(group.openFrame.shots, group.playerIds).points
    : {};
  const leader = Object.entries(points).sort(([, a], [, b]) => b - a)[0];
  const leadLine = leader && leader[1] > 0 ? `${nameOf(leader[0])} ${leader[1]}` : 'In progress';
  return {
    title: group.namedLabel ?? `Free-for-all · ${group.playerIds.length} players`,
    meta: `Frame ${group.frames.length + 1} · ${leadLine}`,
  };
}

/** In-progress games of one league, by kind. */
export interface LiveSessionSet {
  matches: Match[];
  races: Race[];
  groups: GroupMatch[];
}

const EMPTY_SET: LiveSessionSet = { matches: [], races: [], groups: [] };

export function sessionCount(set: LiveSessionSet): number {
  return set.matches.length + set.races.length + set.groups.length;
}

/**
 * Unfinished games of the league, split into `live` (changed in the last 12 hours) and
 * `stale` (idle longer, e.g. someone hit back and walked away). The split is taken on each
 * reload (screen focus, store change), not on a timer.
 */
export function useLiveSessions(leagueId: string | null | undefined): {
  live: LiveSessionSet;
  stale: LiveSessionSet;
  nameOf: (id: string) => string;
} {
  const [live, setLive] = useState<LiveSessionSet>(EMPTY_SET);
  const [stale, setStale] = useState<LiveSessionSet>(EMPTY_SET);
  const [players, setPlayers] = useState<Player[]>([]);

  const reload = useCallback(async () => {
    if (!leagueId) {
      setLive(EMPTY_SET);
      setStale(EMPTY_SET);
      setPlayers([]);
      return;
    }
    const [liveMatches, liveRaces, liveGroups, roster] = await Promise.all([
      matchService.listLiveMatches(leagueId),
      raceService.listLiveRaces(leagueId),
      groupService.listLiveGroupMatches(leagueId),
      listPlayers(leagueId),
    ]);
    const now = Date.now();
    const matches = splitByStaleness(liveMatches, now);
    const races = splitByStaleness(liveRaces, now);
    const groups = splitByStaleness(liveGroups, now);
    setLive({ matches: matches.live, races: races.live, groups: groups.live });
    setStale({ matches: matches.stale, races: races.stale, groups: groups.stale });
    setPlayers(roster);
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? 'Player';

  return { live, stale, nameOf };
}
