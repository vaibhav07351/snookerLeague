import * as groupService from '@/features/group/services/group.service';
import * as matchService from '@/features/match/services/match.service';
import * as raceService from '@/features/race/services/race.service';
import { matchPlayedAt, type GroupMatch, type Match, type Race } from '@/shared/types/domain';

/**
 * One finished or live game in the history list. `at` is when it was last played, a fallback
 * when its start time is unreadable.
 */
export type HistoryItem =
  | { kind: 'match'; at: string; match: Match }
  | { kind: 'group'; at: string; group: GroupMatch }
  | { kind: 'race'; at: string; race: Race };

/** What the format filter can narrow to. Free-for-alls are matches, but filter on their own. */
export type HistoryFormat = 'all' | 'singles' | 'doubles' | 'one_vs_two' | 'free_for_all' | 'race';

export const HISTORY_FORMATS: readonly HistoryFormat[] = [
  'all',
  'singles',
  'doubles',
  'one_vs_two',
  'free_for_all',
  'race',
];

export const HISTORY_FORMAT_LABEL: Record<HistoryFormat, string> = {
  all: 'All games',
  singles: 'Singles',
  doubles: 'Doubles',
  one_vs_two: '1 vs 2',
  free_for_all: 'Free-for-all',
  race: 'Races',
};

export interface HistoryFilter {
  format: HistoryFormat;
  /** Only games this player was in; null for everyone. */
  playerId: string | null;
}

export const NO_FILTER: HistoryFilter = { format: 'all', playerId: null };

export function startedAtOf(item: HistoryItem): string {
  switch (item.kind) {
    case 'match':
      return item.match.createdAt;
    case 'group':
      return item.group.createdAt;
    case 'race':
      return item.race.createdAt;
  }
}

export function idOf(item: HistoryItem): string {
  switch (item.kind) {
    case 'match':
      return item.match.id;
    case 'group':
      return item.group.id;
    case 'race':
      return item.race.id;
  }
}

function formatOf(item: HistoryItem): Exclude<HistoryFormat, 'all'> {
  switch (item.kind) {
    case 'match':
      return matchService.matchFormatOf(item.match);
    case 'group':
      return 'free_for_all';
    case 'race':
      return 'race';
  }
}

function playerIdsOf(item: HistoryItem): readonly string[] {
  switch (item.kind) {
    case 'match':
      return [...item.match.teamA, ...item.match.teamB];
    case 'group':
      return item.group.playerIds;
    case 'race':
      return item.race.entrants.map((e) => e.playerId);
  }
}

export function matchesFilter(item: HistoryItem, filter: HistoryFilter): boolean {
  if (filter.format !== 'all' && formatOf(item) !== filter.format) {
    return false;
  }
  return filter.playerId === null || playerIdsOf(item).includes(filter.playerId);
}

/** All games, newest start first (matching the start time each row shows), then filtered. */
export function buildHistory(
  games: { matches: Match[]; groups: GroupMatch[]; races: Race[] },
  filter: HistoryFilter,
): HistoryItem[] {
  return [
    ...games.matches.map((match) => ({ kind: 'match' as const, at: matchPlayedAt(match), match })),
    ...games.groups.map((group) => ({ kind: 'group' as const, at: group.updatedAt, group })),
    ...games.races.map((race) => ({ kind: 'race' as const, at: race.updatedAt, race })),
  ]
    .filter((item) => matchesFilter(item, filter))
    .sort((a, b) => startedAtOf(b).localeCompare(startedAtOf(a)));
}

export interface HistoryPage {
  items: HistoryItem[];
  /** One of the three lists filled its page, so older games may exist. */
  hasMore: boolean;
}

/**
 * The league's latest `pageSize` games of each kind, filtered. Kinds the format filter rules
 * out are not read at all.
 */
export async function loadHistory(
  leagueId: string,
  pageSize: number,
  filter: HistoryFilter,
): Promise<HistoryPage> {
  const want = (kind: HistoryItem['kind']): boolean => {
    if (filter.format === 'all') {
      return true;
    }
    if (filter.format === 'race') {
      return kind === 'race';
    }
    return filter.format === 'free_for_all' ? kind === 'group' : kind === 'match';
  };
  const opts = { limit: pageSize, order: 'started' as const };
  const [matches, groups, races] = await Promise.all([
    want('match') ? matchService.listMatches(leagueId, opts) : Promise.resolve([]),
    want('group') ? groupService.listGroupMatches(leagueId, opts) : Promise.resolve([]),
    want('race') ? raceService.listRaces(leagueId, opts) : Promise.resolve([]),
  ]);
  return {
    items: buildHistory({ matches, groups, races }, filter),
    hasMore: matches.length === pageSize || groups.length === pageSize || races.length === pageSize,
  };
}
