import {
  MATCH_SETTINGS_FIELDS,
  type FeedEvent,
  type League,
  type Match,
  type Player,
  type Race,
} from '@/shared/types/domain';

function newer(a: string | undefined, b: string | undefined): boolean {
  const left = a ?? '';
  const right = b ?? '';
  return left.localeCompare(right) > 0;
}

type Row = { id: string; updatedAt?: string; createdAt?: string };

/**
 * Decide the merged row when a local and a remote copy of the same document meet.
 * `remotePending` means this phone still has an unsent write for the document.
 */
export type Resolver<T> = (local: T, remote: T, remotePending: boolean) => T;

/** Default: keep a pending local copy, otherwise last write wins on updatedAt. */
function lastWriteWins<T extends Row>(local: T, remote: T, remotePending: boolean): T {
  if (remotePending) {
    return local;
  }
  const localTs = local.updatedAt ?? local.createdAt ?? '';
  const remoteTs = remote.updatedAt ?? remote.createdAt ?? '';
  return newer(remoteTs, localTs) ? remote : local;
}

/**
 * Matches: shots and frames follow last-write-wins, but settings (scorer, policy, title)
 * come from whichever copy changed them last, so a scorer's save and a settings change
 * made on another phone never undo each other.
 */
export const resolveMatch: Resolver<Match> = (local, remote, remotePending) => {
  const base = lastWriteWins(local, remote, remotePending);
  const settingsFrom = newer(remote.settingsUpdatedAt, local.settingsUpdatedAt) ? remote : local;
  if (settingsFrom === base) {
    return base;
  }
  const merged: Match = { ...base };
  for (const key of MATCH_SETTINGS_FIELDS) {
    const value = settingsFrom[key];
    if (value !== undefined) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
};

/** Leagues: membership and the invite code belong to the server unless we have a change queued. */
export const resolveLeague: Resolver<League> = (local, remote, remotePending) => {
  const base = lastWriteWins(local, remote, remotePending);
  if (remotePending) {
    return base;
  }
  return {
    ...base,
    memberUids: remote.memberUids,
    createdByUid: remote.createdByUid,
    inviteCode: remote.inviteCode,
  };
};

function mergeById<T extends Row>(
  local: T[],
  remote: T[],
  pendingDocIds: Set<string>,
  resolve: Resolver<T> = lastWriteWins,
): T[] {
  const map = new Map<string, T>();
  for (const row of local) {
    map.set(row.id, row);
  }
  for (const row of remote) {
    const existing = map.get(row.id);
    if (!existing) {
      if (!pendingDocIds.has(row.id)) {
        map.set(row.id, row);
      }
      continue;
    }
    map.set(row.id, resolve(existing, row, pendingDocIds.has(row.id)));
  }
  return [...map.values()];
}

export function mergeLeagues(
  local: League[],
  remote: League[],
  pendingDocIds: Set<string>,
): League[] {
  return mergeById(local, remote, pendingDocIds, resolveLeague);
}

export function mergePlayers(
  local: Player[],
  remote: Player[],
  pendingDocIds: Set<string>,
): Player[] {
  return mergeById(local, remote, pendingDocIds);
}

export function mergeMatches(local: Match[], remote: Match[], pendingDocIds: Set<string>): Match[] {
  return mergeById(local, remote, pendingDocIds, resolveMatch);
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

/** Replace league-scoped rows for one league, then merge remote with `resolve`. */
export function mergeLeagueScoped<T extends Row & { leagueId: string }>(
  local: T[],
  leagueId: string,
  remoteForLeague: T[],
  pendingDocIds: Set<string>,
  resolve?: Resolver<T>,
): T[] {
  const other = local.filter((r) => r.leagueId !== leagueId);
  const localForLeague = local.filter((r) => r.leagueId === leagueId);
  return [...other, ...mergeById(localForLeague, remoteForLeague, pendingDocIds, resolve)];
}

/**
 * Like mergeLeagueScoped, but treats `remoteForLeague` as the full server truth: local rows
 * of that league missing from it were deleted on another device and are dropped here,
 * unless they still have a pending upload (created offline, not pushed yet).
 * Only call with a server-confirmed snapshot (metadata.fromCache === false).
 */
export function reconcileLeagueScoped<T extends Row & { leagueId: string }>(
  local: T[],
  leagueId: string,
  remoteForLeague: T[],
  pendingDocIds: Set<string>,
  resolve?: Resolver<T>,
): T[] {
  const remoteIds = new Set(remoteForLeague.map((r) => r.id));
  const kept = local.filter(
    (r) => r.leagueId !== leagueId || remoteIds.has(r.id) || pendingDocIds.has(r.id),
  );
  return mergeLeagueScoped(kept, leagueId, remoteForLeague, pendingDocIds, resolve);
}

/**
 * Cache rows fetched by a query (profiles, follows, posts, challenges): the server copy
 * replaces ours, except while ours still has an unsent write.
 */
export function mergeRemoteRows<T extends Row>(
  local: T[],
  remote: T[],
  pendingDocIds: Set<string>,
): T[] {
  return mergeById(local, remote, pendingDocIds, (mine, theirs, pending) =>
    pending ? mine : theirs,
  );
}

/** Ids of documents with a write still queued on this phone. */
export function pendingDocIdsOf(ops: { docId: string }[]): Set<string> {
  return new Set(ops.map((op) => op.docId));
}
