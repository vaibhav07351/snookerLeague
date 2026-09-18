import { collection, getDoc, getDocs, limit, query, where } from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import {
  leagueDocRef,
  leagueEventsCol,
  leagueMatchesCol,
  leaguePlayersCol,
  leagueRacesCol,
  requireFirestore,
  userDocRef,
} from '@/shared/sync/firestore-paths';
import { firebaseErrorMeta } from '@/shared/sync/firebase-error';
import { mergeLeagueScoped, mergeLeagues } from '@/shared/sync/merge';
import type {
  CloudUserProfile,
  FeedEvent,
  League,
  Match,
  Player,
  Race,
} from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

const READ_TIMEOUT_MS = 25_000;
/** Stable fallback — never use nowIso() in mappers or every read looks like a change. */
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
      standard: stats?.standard ?? emptyStandardStats(),
      race: stats?.race ?? emptyRaceStats(),
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
    withTimeout(getDocs(leaguePlayersCol(leagueId)), `players ${leagueId}`),
    withTimeout(getDocs(leagueMatchesCol(leagueId)), `matches ${leagueId}`),
    withTimeout(getDocs(leagueRacesCol(leagueId)), `races ${leagueId}`),
    withTimeout(getDocs(leagueEventsCol(leagueId)), `events ${leagueId}`),
  ]);

  return {
    league,
    players: playersSnap.docs.map((d) => asPlayer(d.data(), d.id, leagueId)),
    matches: matchesSnap.docs.map((d) => asMatch(d.data(), d.id, leagueId)),
    races: racesSnap.docs.map((d) => asRace(d.data(), d.id, leagueId)),
    events: eventsSnap.docs.map((d) => asEvent(d.data(), d.id, leagueId)),
  };
}

export async function findLeagueByInviteCode(code: string): Promise<League | null> {
  const db = requireFirestore();
  const q = query(
    collection(db, 'leagues'),
    where('inviteCode', '==', code.toUpperCase()),
    limit(1),
  );
  const snap = await withTimeout(getDocs(q), `invite ${code}`);
  const first = snap.docs[0];
  if (!first) {
    return null;
  }
  return asLeague(first.data(), first.id);
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
  const pending = pendingIds();

  await updateStore((s) => ({
    ...s,
    leagues: mergeLeagues(s.leagues, [bundle.league!], pending),
    players: mergeLeagueScoped(s.players, leagueId, bundle.players, pending),
    matches: mergeLeagueScoped(s.matches, leagueId, bundle.matches, pending),
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
      const bundle = await fetchLeagueBundle(leagueId);
      if (bundle.league) {
        remoteLeagues.push(bundle.league);
        await applyLeagueBundleToLocal(bundle);
      }
    }

    const pending = pendingIds();
    await updateStore((s) => {
      let activeLeagueId = s.activeLeagueId;
      if (profile?.activeLeagueId) {
        activeLeagueId = profile.activeLeagueId;
      } else if (activeLeagueId && !s.leagues.some((l) => l.id === activeLeagueId)) {
        activeLeagueId = s.leagues.find((l) => l.memberUids.includes(uid))?.id ?? null;
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
