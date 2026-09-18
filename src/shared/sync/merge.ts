import type { FeedEvent, League, Match, Player, Race } from '@/shared/types/domain';

function newer(a: string | undefined, b: string | undefined): boolean {
  const left = a ?? '';
  const right = b ?? '';
  return left.localeCompare(right) > 0;
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[],
  pendingDocIds: Set<string>,
): T[] {
  const map = new Map<string, T>();
  for (const row of local) {
    map.set(row.id, row);
  }
  for (const row of remote) {
    if (pendingDocIds.has(row.id)) {
      continue;
    }
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, row);
      continue;
    }
    const existingTs = existing.updatedAt ?? existing.createdAt ?? '';
    const remoteTs = row.updatedAt ?? row.createdAt ?? '';
    if (newer(remoteTs, existingTs)) {
      map.set(row.id, row);
    }
  }
  return [...map.values()];
}

export function mergeLeagues(
  local: League[],
  remote: League[],
  pendingDocIds: Set<string>,
): League[] {
  return mergeById(local, remote, pendingDocIds);
}

export function mergePlayers(
  local: Player[],
  remote: Player[],
  pendingDocIds: Set<string>,
): Player[] {
  return mergeById(local, remote, pendingDocIds);
}

export function mergeMatches(local: Match[], remote: Match[], pendingDocIds: Set<string>): Match[] {
  return mergeById(local, remote, pendingDocIds);
}

export function mergeRaces(local: Race[], remote: Race[], pendingDocIds: Set<string>): Race[] {
  return mergeById(local, remote, pendingDocIds);
}

export function mergeEvents(
  local: FeedEvent[],
  remote: FeedEvent[],
  pendingDocIds: Set<string>,
): FeedEvent[] {
  return mergeById(local, remote, pendingDocIds);
}

/** Replace league-scoped rows for one league, then merge remote with LWW. */
export function mergeLeagueScoped<
  T extends { id: string; leagueId: string; updatedAt?: string; createdAt?: string },
>(local: T[], leagueId: string, remoteForLeague: T[], pendingDocIds: Set<string>): T[] {
  const other = local.filter((r) => r.leagueId !== leagueId);
  const localForLeague = local.filter((r) => r.leagueId === leagueId);
  return [...other, ...mergeById(localForLeague, remoteForLeague, pendingDocIds)];
}
