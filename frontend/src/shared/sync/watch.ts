import { onSnapshot, type QuerySnapshot, type Unsubscribe } from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import {
  dropUnreachableLeague,
  markLeaguesInCloud,
  removeLeagueLocally,
} from '@/shared/sync/cloud-leagues';
import { isOnline } from '@/shared/sync/connectivity';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import {
  isCityHubLeagueId,
  leagueCollectionQuery,
  leagueDocRef,
  shouldCloudSync,
} from '@/shared/sync/firestore-paths';
import {
  mergeLeagueScoped,
  mergeLeagues,
  reconcileLeagueScoped,
  resolveMatch,
  type Resolver,
} from '@/shared/sync/merge';
import type { FeedEvent, League, Match, Player, Race } from '@/shared/types/domain';
import { cityHubId, emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

let unsubscribers: Unsubscribe[] = [];
let watchedKey = '';

function pendingIds(): Set<string> {
  return new Set(getStore().pendingOps.map((op) => op.docId));
}

function stopWatchers(): void {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  watchedKey = '';
}

/** Stable fallback - never use nowIso() here or every snapshot looks like a write. */
const MISSING_TS = '1970-01-01T00:00:00.000Z';

function asLeague(data: Record<string, unknown>, id: string): League {
  const createdAt = String(data.createdAt ?? MISSING_TS);
  return {
    id,
    name: String(data.name ?? ''),
    inviteCode: String(data.inviteCode ?? ''),
    createdAt,
    updatedAt: String(data.updatedAt ?? data.createdAt ?? createdAt),
    createdByUid: String(data.createdByUid ?? ''),
    memberUids: Array.isArray(data.memberUids) ? (data.memberUids as string[]) : [],
    defaultRaceTarget: Number(data.defaultRaceTarget ?? 50),
    defaultBestOf: Number(data.defaultBestOf ?? 3),
    reigningTeam: (data.reigningTeam as League['reigningTeam']) ?? null,
    raceKing: (data.raceKing as League['raceKing']) ?? null,
    kind: data.kind === 'city' ? 'city' : 'club',
    cityId: typeof data.cityId === 'string' ? data.cityId : null,
  };
}

/**
 * Live-merge the active league from Firestore into local store.
 * Safe to call repeatedly; swaps watchers when leagueId changes.
 */
export function watchActiveLeague(leagueId: string | null): void {
  const user = getStore().user;
  if (!shouldCloudSync(user) || !isOnline()) {
    stopWatchers();
    return;
  }
  const ids = [
    ...new Set(
      [leagueId, user?.cityId ? cityHubId(user.cityId) : null].filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];
  if (ids.length === 0) {
    stopWatchers();
    return;
  }
  const key = ids.slice().sort().join(',');
  if (watchedKey === key && unsubscribers.length > 0) {
    return;
  }

  stopWatchers();
  watchedKey = key;

  try {
    for (const id of ids) {
      attachLeagueWatchers(id);
    }
  } catch (error) {
    logger.error('sync.watch', 'Failed to start watchers', {
      ...firebaseErrorMeta(error),
      leagueId,
    });
    stopWatchers();
  }
}

interface RemovalPlan {
  mode: 'merge' | 'reconcile' | 'explicit';
  removedIds: Set<string>;
}

/**
 * How a collection snapshot may remove local rows that were deleted elsewhere:
 * - cache snapshot: never (it can be partial);
 * - first server snapshot after attaching: anything missing from it (catches deletes
 *   that happened while this phone was not listening);
 * - later server snapshots: only docs the server reports as removed, so a row saved
 *   locally a moment before its upload starts is never dropped.
 */
function removalPlan(snap: QuerySnapshot, tracker: { reconciled: boolean }): RemovalPlan {
  if (snap.metadata.fromCache) {
    return { mode: 'merge', removedIds: new Set() };
  }
  if (!tracker.reconciled) {
    tracker.reconciled = true;
    return { mode: 'reconcile', removedIds: new Set() };
  }
  const removedIds = new Set(
    snap
      .docChanges()
      .filter((change) => change.type === 'removed')
      .map((change) => change.doc.id),
  );
  return { mode: 'explicit', removedIds };
}

function applyRemote<
  T extends { id: string; leagueId: string; updatedAt?: string; createdAt?: string },
>(
  local: T[],
  leagueId: string,
  remote: T[],
  pending: Set<string>,
  plan: RemovalPlan,
  resolve?: Resolver<T>,
): T[] {
  if (plan.mode === 'reconcile') {
    return reconcileLeagueScoped(local, leagueId, remote, pending, resolve);
  }
  const kept =
    plan.mode === 'explicit' && plan.removedIds.size > 0
      ? local.filter(
          (r) => r.leagueId !== leagueId || !plan.removedIds.has(r.id) || pending.has(r.id),
        )
      : local;
  return mergeLeagueScoped(kept, leagueId, remote, pending, resolve);
}

function attachLeagueWatchers(leagueId: string): void {
  // City hubs sync only their most recent rows, so a snapshot is never the full truth:
  // remove only what the server reports as deleted, never what is merely beyond the limit.
  const partial = isCityHubLeagueId(leagueId);
  const trackers = {
    players: { reconciled: partial },
    matches: { reconciled: partial },
    races: { reconciled: partial },
    events: { reconciled: partial },
  };
  unsubscribers.push(
    onSnapshot(
      leagueDocRef(leagueId),
      (snap) => {
        if (!snap.exists()) {
          if (!snap.metadata.fromCache && !pendingIds().has(leagueId)) {
            void removeLeagueLocally(leagueId);
          }
          return;
        }
        const league = asLeague(snap.data(), snap.id);
        void markLeaguesInCloud([league.id]);
        const pending = pendingIds();
        void updateStore((s) => {
          const leagues = mergeLeagues(s.leagues, [league], pending);
          if (JSON.stringify(leagues) === JSON.stringify(s.leagues)) {
            return s;
          }
          return { ...s, leagues };
        });
      },
      (error) => {
        const meta = firebaseErrorMeta(error);
        logger.error('sync.watch', 'League snapshot error', { ...meta, leagueId });
        watchedKey = '';
        if (meta.code === 'permission-denied') {
          // Not a member on the server: drop it and follow whichever league is active now.
          void dropUnreachableLeague(leagueId).then(() => {
            stopWatchers();
            watchActiveLeague(getStore().activeLeagueId);
          });
        }
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueCollectionQuery(leagueId, 'players'),
      (snap) => {
        const players: Player[] = snap.docs.map((d) => {
          const data = d.data();
          const stats = data.stats as Player['stats'] | undefined;
          const createdAt = String(data.createdAt ?? MISSING_TS);
          return {
            id: d.id,
            leagueId: String(data.leagueId ?? leagueId),
            displayName: String(data.displayName ?? ''),
            kind: data.kind === 'guest' ? 'guest' : 'member',
            authUid: (data.authUid as string | null) ?? null,
            photoUrl: (data.photoUrl as string | null) ?? null,
            createdAt,
            updatedAt: String(data.updatedAt ?? data.createdAt ?? createdAt),
            stats: {
              standard: { ...emptyStandardStats(), ...stats?.standard },
              race: { ...emptyRaceStats(), ...stats?.race },
            },
          };
        });
        const pending = pendingIds();
        const plan = removalPlan(snap, trackers.players);
        void updateStore((s) => {
          const next = applyRemote(s.players, leagueId, players, pending, plan);
          if (JSON.stringify(next) === JSON.stringify(s.players)) {
            return s;
          }
          return { ...s, players: next };
        });
      },
      (error) => {
        // Firestore ends a listener after an error: re-attach on the next watch call.
        watchedKey = '';
        logger.error('sync.watch', 'Players snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueCollectionQuery(leagueId, 'matches'),
      (snap) => {
        const matches: Match[] = snap.docs.map((d) => ({
          ...(d.data() as Match),
          id: d.id,
          leagueId: String(d.data().leagueId ?? leagueId),
        }));
        const pending = pendingIds();
        const plan = removalPlan(snap, trackers.matches);
        void updateStore((s) => {
          const next = applyRemote(s.matches, leagueId, matches, pending, plan, resolveMatch);
          if (JSON.stringify(next) === JSON.stringify(s.matches)) {
            return s;
          }
          return { ...s, matches: next };
        });
      },
      (error) => {
        // Firestore ends a listener after an error: re-attach on the next watch call.
        watchedKey = '';
        logger.error('sync.watch', 'Matches snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueCollectionQuery(leagueId, 'races'),
      (snap) => {
        const races: Race[] = snap.docs.map((d) => ({
          ...(d.data() as Race),
          id: d.id,
          leagueId: String(d.data().leagueId ?? leagueId),
        }));
        const pending = pendingIds();
        const plan = removalPlan(snap, trackers.races);
        void updateStore((s) => {
          const next = applyRemote(s.races, leagueId, races, pending, plan);
          if (JSON.stringify(next) === JSON.stringify(s.races)) {
            return s;
          }
          return { ...s, races: next };
        });
      },
      (error) => {
        // Firestore ends a listener after an error: re-attach on the next watch call.
        watchedKey = '';
        logger.error('sync.watch', 'Races snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueCollectionQuery(leagueId, 'events'),
      (snap) => {
        const events: FeedEvent[] = snap.docs.map((d) => {
          const data = d.data();
          const createdAt = String(data.createdAt ?? MISSING_TS);
          return {
            id: d.id,
            leagueId: String(data.leagueId ?? leagueId),
            type: data.type as FeedEvent['type'],
            createdAt,
            updatedAt: String(data.updatedAt ?? createdAt),
            title: String(data.title ?? ''),
            body: String(data.body ?? ''),
            relatedIds: Array.isArray(data.relatedIds) ? (data.relatedIds as string[]) : [],
          };
        });
        const pending = pendingIds();
        const plan = removalPlan(snap, trackers.events);
        void updateStore((s) => {
          const next = applyRemote(s.events, leagueId, events, pending, plan);
          if (JSON.stringify(next) === JSON.stringify(s.events)) {
            return s;
          }
          return { ...s, events: next };
        });
      },
      (error) => {
        // Firestore ends a listener after an error: re-attach on the next watch call.
        watchedKey = '';
        logger.error('sync.watch', 'Events snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );
}

export function stopWatchingActiveLeague(): void {
  stopWatchers();
}
