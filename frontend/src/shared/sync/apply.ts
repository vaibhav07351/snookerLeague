import type { DocEntity, ServerDoc } from '@/shared/api/sync-api';
import { updateStore } from '@/shared/storage/local-store';
import { withoutLeague } from '@/shared/sync/cloud-leagues';
import { asEvent, asLeague, asMatch, asPlayer, asRace, versionKey } from '@/shared/sync/mappers';
import {
  mergeEvents,
  mergeLeagues,
  mergeMatches,
  mergePlayers,
  mergeRaces,
  pendingDocIdsOf,
} from '@/shared/sync/merge';
import type { AppDataStore, FeedEvent, League, Match, Player, Race } from '@/shared/types/domain';

type RowKey = 'players' | 'matches' | 'races' | 'events';

const ROW_KEY: Record<Exclude<DocEntity, 'league'>, RowKey> = {
  player: 'players',
  match: 'matches',
  race: 'races',
  event: 'events',
};

/** Server copy of one document as the app's local type. */
export function localRowOf(doc: ServerDoc): League | Player | Match | Race | FeedEvent | null {
  if (doc.deleted || !doc.data) {
    return null;
  }
  switch (doc.entity) {
    case 'league':
      return asLeague(doc.data, doc.id);
    case 'player':
      return asPlayer(doc.data, doc.id, doc.leagueId);
    case 'match':
      return asMatch(doc.data, doc.id, doc.leagueId);
    case 'race':
      return asRace(doc.data, doc.id, doc.leagueId);
    case 'event':
      return asEvent(doc.data, doc.id, doc.leagueId);
  }
}

function mergeDocs(s: AppDataStore, docs: ServerDoc[]): AppDataStore {
  const pending = pendingDocIdsOf(s.pendingOps);
  const serverVersions = { ...s.serverVersions };
  const leagues: League[] = [];
  const players: Player[] = [];
  const matches: Match[] = [];
  const races: Race[] = [];
  const events: FeedEvent[] = [];
  const deletedLeagues: string[] = [];
  const deleted = new Map<RowKey, Set<string>>();

  for (const doc of docs) {
    serverVersions[versionKey(doc.entity, doc.id)] = doc.version;
    const row = localRowOf(doc);
    if (!row) {
      if (doc.entity === 'league') {
        deletedLeagues.push(doc.id);
      } else {
        const key = ROW_KEY[doc.entity];
        deleted.set(key, (deleted.get(key) ?? new Set()).add(doc.id));
      }
      continue;
    }
    switch (doc.entity) {
      case 'league':
        leagues.push(row as League);
        break;
      case 'player':
        players.push(row as Player);
        break;
      case 'match':
        matches.push(row as Match);
        break;
      case 'race':
        races.push(row as Race);
        break;
      case 'event':
        events.push(row as FeedEvent);
        break;
    }
  }

  let next: AppDataStore = {
    ...s,
    serverVersions,
    leagues: leagues.length > 0 ? mergeLeagues(s.leagues, leagues, pending) : s.leagues,
    players: players.length > 0 ? mergePlayers(s.players, players, pending) : s.players,
    matches: matches.length > 0 ? mergeMatches(s.matches, matches, pending) : s.matches,
    races: races.length > 0 ? mergeRaces(s.races, races, pending) : s.races,
    events: events.length > 0 ? mergeEvents(s.events, events, pending) : s.events,
  };
  // Deleted on the server: remove here too, with any queued write the server would refuse.
  for (const [key, ids] of deleted) {
    next = {
      ...next,
      [key]: (next[key] as { id: string }[]).filter((r) => !ids.has(r.id)),
      pendingOps: next.pendingOps.filter((op) => !ids.has(op.docId)),
    };
  }
  for (const leagueId of deletedLeagues) {
    next = withoutLeague(next, leagueId);
  }
  return next;
}

/** Merge pulled documents into this phone's store (queued local writes win until sent). */
export async function applyServerDocs(docs: ServerDoc[]): Promise<void> {
  if (docs.length === 0) {
    return;
  }
  await updateStore((s) => mergeDocs(s, docs));
}

/**
 * Make this phone hold exactly the server's copy of one document, even while a local write
 * for it is queued (used after the server refused or out-dated that write).
 */
export async function replaceWithServerDoc(doc: ServerDoc): Promise<void> {
  await updateStore((s) => {
    const serverVersions = { ...s.serverVersions, [versionKey(doc.entity, doc.id)]: doc.version };
    const row = localRowOf(doc);
    if (doc.entity === 'league') {
      if (!row) {
        return { ...withoutLeague(s, doc.id), serverVersions };
      }
      const league = row as League;
      const has = s.leagues.some((l) => l.id === league.id);
      return {
        ...s,
        serverVersions,
        leagues: has
          ? s.leagues.map((l) => (l.id === league.id ? league : l))
          : [...s.leagues, league],
      };
    }
    const key = ROW_KEY[doc.entity];
    const rows = (s[key] as { id: string }[]).filter((r) => r.id !== doc.id);
    return { ...s, serverVersions, [key]: row ? [...rows, row] : rows };
  });
}

/** Store one rebased row and the server version it is now based on. */
export async function storeRebasedRow(
  entity: DocEntity,
  row: League | Player | Match | Race | FeedEvent,
  version: number,
): Promise<void> {
  await updateStore((s) => {
    const serverVersions = { ...s.serverVersions, [versionKey(entity, row.id)]: version };
    if (entity === 'league') {
      return {
        ...s,
        serverVersions,
        leagues: s.leagues.map((l) => (l.id === row.id ? (row as League) : l)),
      };
    }
    const key = ROW_KEY[entity];
    const rows = (s[key] as { id: string }[]).filter((r) => r.id !== row.id);
    return { ...s, serverVersions, [key]: [...rows, row] };
  });
}

/** Remember the server version a successful write produced. */
export async function recordVersion(entity: DocEntity, id: string, version: number): Promise<void> {
  await updateStore((s) => ({
    ...s,
    serverVersions: { ...s.serverVersions, [versionKey(entity, id)]: version },
  }));
}
