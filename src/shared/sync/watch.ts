import { onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import { isOnline } from '@/shared/sync/connectivity';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import {
  leagueDocRef,
  leagueEventsCol,
  leagueMatchesCol,
  leaguePlayersCol,
  leagueRacesCol,
  shouldCloudSync,
} from '@/shared/sync/firestore-paths';
import { mergeLeagueScoped, mergeLeagues } from '@/shared/sync/merge';
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

/** Stable fallback — never use nowIso() here or every snapshot looks like a write. */
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

function attachLeagueWatchers(leagueId: string): void {
  unsubscribers.push(
    onSnapshot(
      leagueDocRef(leagueId),
      (snap) => {
        if (!snap.exists()) {
          return;
        }
        const league = asLeague(snap.data(), snap.id);
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
        logger.error('sync.watch', 'League snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leaguePlayersCol(leagueId),
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
        void updateStore((s) => {
          const next = mergeLeagueScoped(s.players, leagueId, players, pending);
          if (JSON.stringify(next) === JSON.stringify(s.players)) {
            return s;
          }
          return { ...s, players: next };
        });
      },
      (error) => {
        logger.error('sync.watch', 'Players snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueMatchesCol(leagueId),
      (snap) => {
        const matches: Match[] = snap.docs.map((d) => ({
          ...(d.data() as Match),
          id: d.id,
          leagueId: String(d.data().leagueId ?? leagueId),
        }));
        const pending = pendingIds();
        void updateStore((s) => {
          const next = mergeLeagueScoped(s.matches, leagueId, matches, pending);
          if (JSON.stringify(next) === JSON.stringify(s.matches)) {
            return s;
          }
          return { ...s, matches: next };
        });
      },
      (error) => {
        logger.error('sync.watch', 'Matches snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueRacesCol(leagueId),
      (snap) => {
        const races: Race[] = snap.docs.map((d) => ({
          ...(d.data() as Race),
          id: d.id,
          leagueId: String(d.data().leagueId ?? leagueId),
        }));
        const pending = pendingIds();
        void updateStore((s) => {
          const next = mergeLeagueScoped(s.races, leagueId, races, pending);
          if (JSON.stringify(next) === JSON.stringify(s.races)) {
            return s;
          }
          return { ...s, races: next };
        });
      },
      (error) => {
        logger.error('sync.watch', 'Races snapshot error', {
          ...firebaseErrorMeta(error),
          leagueId,
        });
      },
    ),
  );

  unsubscribers.push(
    onSnapshot(
      leagueEventsCol(leagueId),
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
        void updateStore((s) => {
          const next = mergeLeagueScoped(s.events, leagueId, events, pending);
          if (JSON.stringify(next) === JSON.stringify(s.events)) {
            return s;
          }
          return { ...s, events: next };
        });
      },
      (error) => {
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
