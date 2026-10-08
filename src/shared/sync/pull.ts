import { getDoc, getDocs } from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import {
  leagueCollectionQuery,
  leagueDocRef,
  leagueInviteDocRef,
  eventDocRef,
  matchDocRef,
  playerDocRef,
  raceDocRef,
  userDocRef,
} from '@/shared/sync/firestore-paths';
import {
  dropUnreachableLeague,
  markLeaguesInCloud,
  removeLeagueLocally,
} from '@/shared/sync/cloud-leagues';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import { mergeLeagueScoped, mergeLeagues, resolveMatch } from '@/shared/sync/merge';
import type {
  CloudUserProfile,
  FeedEvent,
  League,
  LeagueInvite,
  Match,
  PendingOp,
  Player,
  Race,
} from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats, leagueKindOf } from '@/shared/types/domain';

const READ_TIMEOUT_MS = 25_000;
/** Stable fallback - never use nowIso() in mappers or every read looks like a change. */
const MISSING_TS = '1970-01-01T00:00:00.000Z';

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), READ_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function pendingIds(): Set<string> {
  return new Set(getStore().pendingOps.map((op) => op.docId));
}

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

function asPlayer(data: Record<string, unknown>, id: string, leagueId: string): Player {
  const stats = data.stats as Player['stats'] | undefined;
  const createdAt = String(data.createdAt ?? MISSING_TS);
  return {
    id,
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
}

function asMatch(data: Record<string, unknown>, id: string, leagueId: string): Match {
  return {
    ...(data as unknown as Match),
    id,
    leagueId: String(data.leagueId ?? leagueId),
  };
}

function asRace(data: Record<string, unknown>, id: string, leagueId: string): Race {
  return {
    ...(data as unknown as Race),
    id,
    leagueId: String(data.leagueId ?? leagueId),
  };
}

function asEvent(data: Record<string, unknown>, id: string, leagueId: string): FeedEvent {
  const createdAt = String(data.createdAt ?? MISSING_TS);
  return {
    id,
    leagueId: String(data.leagueId ?? leagueId),
    type: data.type as FeedEvent['type'],
    createdAt,
    updatedAt: String(data.updatedAt ?? createdAt),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    relatedIds: Array.isArray(data.relatedIds) ? (data.relatedIds as string[]) : [],
  };
}

export async function fetchCloudUser(uid: string): Promise<CloudUserProfile | null> {
  const snap = await withTimeout(getDoc(userDocRef(uid)), `get user/${uid}`);
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  return {
    uid,
    displayName: String(data.displayName ?? ''),
    email: (data.email as string | null) ?? null,
    photoUrl: (data.photoUrl as string | null) ?? null,
    leagueIds: Array.isArray(data.leagueIds) ? (data.leagueIds as string[]) : [],
    activeLeagueId: (data.activeLeagueId as string | null) ?? null,
    updatedAt: String(data.updatedAt ?? MISSING_TS),
    cityId: typeof data.cityId === 'string' ? data.cityId : null,
    cityName: typeof data.cityName === 'string' ? data.cityName : null,
    dateOfBirth: typeof data.dateOfBirth === 'string' ? data.dateOfBirth : null,
  };
}

export async function fetchLeagueBundle(leagueId: string): Promise<{
  league: League | null;
  players: Player[];
  matches: Match[];
  races: Race[];
  events: FeedEvent[];
}> {
  const leagueSnap = await withTimeout(getDoc(leagueDocRef(leagueId)), `get league/${leagueId}`);
  if (!leagueSnap.exists()) {
    return { league: null, players: [], matches: [], races: [], events: [] };
  }
  const league = asLeague(leagueSnap.data(), leagueId);

  const [playersSnap, matchesSnap, racesSnap, eventsSnap] = await Promise.all([
    withTimeout(getDocs(leagueCollectionQuery(leagueId, 'players')), `players ${leagueId}`),
    withTimeout(getDocs(leagueCollectionQuery(leagueId, 'matches')), `matches ${leagueId}`),
    withTimeout(getDocs(leagueCollectionQuery(leagueId, 'races')), `races ${leagueId}`),
    withTimeout(getDocs(leagueCollectionQuery(leagueId, 'events')), `events ${leagueId}`),
  ]);

  return {
    league,
    players: playersSnap.docs.map((d) => asPlayer(d.data(), d.id, leagueId)),
    matches: matchesSnap.docs.map((d) => asMatch(d.data(), d.id, leagueId)),
    races: racesSnap.docs.map((d) => asRace(d.data(), d.id, leagueId)),
    events: eventsSnap.docs.map((d) => asEvent(d.data(), d.id, leagueId)),
  };
}

/** Resolve an invite code to its league (a point read; codes cannot be listed). */
export async function fetchLeagueInvite(code: string): Promise<LeagueInvite | null> {
  const upper = code.trim().toUpperCase();
  const snap = await withTimeout(getDoc(leagueInviteDocRef(upper)), `invite ${upper}`);
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  if (typeof data.leagueId !== 'string' || data.leagueId.length === 0) {
    return null;
  }
  return {
    code: upper,
    leagueId: data.leagueId,
    leagueName: String(data.leagueName ?? 'League'),
    createdByUid: String(data.createdByUid ?? ''),
    updatedAt: String(data.updatedAt ?? MISSING_TS),
  };
}

/** True when the league document already exists in Firestore. */
export async function leagueExistsRemote(leagueId: string): Promise<boolean> {
  const snap = await withTimeout(getDoc(leagueDocRef(leagueId)), `exists league/${leagueId}`);
  return snap.exists();
}

/** Merge one league bundle into local store (LWW; skip pending ids). */
export async function applyLeagueBundleToLocal(bundle: {
  league: League | null;
  players: Player[];
  matches: Match[];
  races: Race[];
  events: FeedEvent[];
}): Promise<void> {
  if (!bundle.league) {
    return;
  }
  const leagueId = bundle.league.id;
  await markLeaguesInCloud([leagueId]);
  const pending = pendingIds();

  await updateStore((s) => ({
    ...s,
    leagues: mergeLeagues(s.leagues, [bundle.league!], pending),
    players: mergeLeagueScoped(s.players, leagueId, bundle.players, pending),
    matches: mergeLeagueScoped(s.matches, leagueId, bundle.matches, pending, resolveMatch),
    races: mergeLeagueScoped(s.races, leagueId, bundle.races, pending),
    events: mergeLeagueScoped(s.events, leagueId, bundle.events, pending),
  }));
}

/**
 * Pull user profile + all member leagues from Firestore into local store.
 */
export async function pullUserAndLeagues(uid: string): Promise<void> {
  try {
    const profile = await fetchCloudUser(uid);
    const local = getStore();
    const leagueIds = new Set<string>([
      ...(profile?.leagueIds ?? []),
      ...local.leagues.filter((l) => l.memberUids.includes(uid)).map((l) => l.id),
    ]);

    const remoteLeagues: League[] = [];
    for (const leagueId of leagueIds) {
      try {
        const bundle = await fetchLeagueBundle(leagueId);
        if (bundle.league) {
          remoteLeagues.push(bundle.league);
          await applyLeagueBundleToLocal(bundle);
        }
      } catch (error) {
        // One league we cannot read must not stop every other league from syncing.
        const meta = firebaseErrorMeta(error);
        if (meta.code === 'permission-denied') {
          await dropUnreachableLeague(leagueId);
        } else {
          logger.warn('sync.pull', 'Skipping league that could not be read', { ...meta, leagueId });
        }
      }
    }

    const pending = pendingIds();
    await updateStore((s) => {
      // Only follow a league this phone actually has and is a member of.
      const usable = (id: string | null | undefined): boolean =>
        id != null && s.leagues.some((l) => l.id === id && l.memberUids.includes(uid));
      let activeLeagueId = s.activeLeagueId;
      if (usable(profile?.activeLeagueId)) {
        activeLeagueId = profile!.activeLeagueId;
      } else if (!usable(activeLeagueId)) {
        activeLeagueId =
          s.leagues.find((l) => l.memberUids.includes(uid) && leagueKindOf(l) !== 'city')?.id ??
          null;
      }
      return {
        ...s,
        leagues: mergeLeagues(s.leagues, remoteLeagues, pending),
        activeLeagueId,
        user: s.user
          ? {
              ...s.user,
              displayName: profile?.displayName || s.user.displayName,
              email: profile?.email ?? s.user.email,
              photoUrl: profile?.photoUrl ?? s.user.photoUrl,
              cityId: profile?.cityId ?? s.user.cityId,
              cityName: profile?.cityName ?? s.user.cityName,
              dateOfBirth: profile?.dateOfBirth ?? s.user.dateOfBirth ?? null,
            }
          : s.user,
      };
    });

    logger.info('sync.pull', 'Pulled user leagues', { uid, count: leagueIds.size });
  } catch (error) {
    logger.error('sync.pull', 'pullUserAndLeagues failed', {
      ...firebaseErrorMeta(error),
      uid,
    });
    throw error;
  }
}

type LeagueRowKey = 'players' | 'matches' | 'races' | 'events';

/** Replace (or remove, when `row` is null) one league-scoped row, ignoring timestamps. */
async function forceLocalRow<T extends { id: string }>(
  key: LeagueRowKey,
  id: string,
  row: T | null,
): Promise<void> {
  if (!row) {
    // Nothing on the server (a rejected create): keep this phone's copy rather than lose it.
    return;
  }
  await updateStore((s) => {
    const rows = s[key] as unknown as T[];
    const without = rows.filter((r) => r.id !== id);
    return { ...s, [key]: row ? [...without, row] : without };
  });
}

/**
 * The server refused one of our writes: load what it really holds so this phone stops
 * showing a change nobody else can see (e.g. a guest card someone else claimed first).
 */
export async function refetchAfterRejection(op: PendingOp): Promise<void> {
  try {
    if (op.entity === 'league') {
      const snap = await withTimeout(getDoc(leagueDocRef(op.docId)), `refetch league/${op.docId}`);
      if (!snap.exists()) {
        await removeLeagueLocally(op.docId);
        return;
      }
      const league = asLeague(snap.data(), op.docId);
      await updateStore((s) => ({
        ...s,
        leagues: s.leagues.map((l) => (l.id === league.id ? league : l)),
      }));
      return;
    }
    const leagueId = op.leagueId;
    if (!leagueId) {
      return;
    }
    if (op.entity === 'player') {
      const snap = await withTimeout(getDoc(playerDocRef(leagueId, op.docId)), 'refetch player');
      await forceLocalRow(
        'players',
        op.docId,
        snap.exists() ? asPlayer(snap.data(), op.docId, leagueId) : null,
      );
    } else if (op.entity === 'match') {
      const snap = await withTimeout(getDoc(matchDocRef(leagueId, op.docId)), 'refetch match');
      await forceLocalRow(
        'matches',
        op.docId,
        snap.exists() ? asMatch(snap.data(), op.docId, leagueId) : null,
      );
    } else if (op.entity === 'race') {
      const snap = await withTimeout(getDoc(raceDocRef(leagueId, op.docId)), 'refetch race');
      await forceLocalRow(
        'races',
        op.docId,
        snap.exists() ? asRace(snap.data(), op.docId, leagueId) : null,
      );
    } else if (op.entity === 'event') {
      const snap = await withTimeout(getDoc(eventDocRef(leagueId, op.docId)), 'refetch event');
      await forceLocalRow(
        'events',
        op.docId,
        snap.exists() ? asEvent(snap.data(), op.docId, leagueId) : null,
      );
    }
  } catch (error) {
    logger.warn('sync.pull', 'Could not refetch after a rejected write', {
      ...firebaseErrorMeta(error),
      entity: op.entity,
      docId: op.docId,
    });
  }
}
