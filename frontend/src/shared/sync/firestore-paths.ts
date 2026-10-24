import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  type Query,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

import { getFirestoreDb, hasFirebaseAuthForUid, isFirebaseEnabled } from '@/shared/firebase/app';
import { AppError } from '@/shared/errors/app-error';
import type { SessionUser } from '@/shared/types/domain';

export function shouldCloudSync(user: SessionUser | null | undefined): boolean {
  if (!isFirebaseEnabled() || user == null || user.isDemo) {
    return false;
  }
  // Firestore rules require request.auth - local AsyncStorage session alone is not enough.
  return hasFirebaseAuthForUid(user.uid);
}

export function requireFirestore(): Firestore {
  const db = getFirestoreDb();
  if (!db) {
    throw new AppError('AUTH_UNAVAILABLE', 'Firestore is not configured');
  }
  return db;
}

export function userDocRef(uid: string): DocumentReference {
  return doc(requireFirestore(), 'users', uid);
}

export function leagueDocRef(leagueId: string): DocumentReference {
  return doc(requireFirestore(), 'leagues', leagueId);
}

export function leaguePlayersCol(leagueId: string): CollectionReference {
  return collection(requireFirestore(), 'leagues', leagueId, 'players');
}

export function leagueMatchesCol(leagueId: string): CollectionReference {
  return collection(requireFirestore(), 'leagues', leagueId, 'matches');
}

export function leagueRacesCol(leagueId: string): CollectionReference {
  return collection(requireFirestore(), 'leagues', leagueId, 'races');
}

export function leagueEventsCol(leagueId: string): CollectionReference {
  return collection(requireFirestore(), 'leagues', leagueId, 'events');
}

/** City hubs are shared by a whole city, so only their most recent rows are synced. */
const CITY_HUB_LIMITS = { players: 500, matches: 200, races: 100, events: 200 } as const;

export type LeagueCollection = keyof typeof CITY_HUB_LIMITS;

export function isCityHubLeagueId(leagueId: string): boolean {
  return leagueId.startsWith('city_');
}

/**
 * What to read or watch for one league collection: everything for a club league; for a
 * city hub, the most recently updated rows only (players are capped, not ordered).
 */
export function leagueCollectionQuery(leagueId: string, kind: LeagueCollection): Query {
  const col =
    kind === 'players'
      ? leaguePlayersCol(leagueId)
      : kind === 'matches'
        ? leagueMatchesCol(leagueId)
        : kind === 'races'
          ? leagueRacesCol(leagueId)
          : leagueEventsCol(leagueId);
  if (!isCityHubLeagueId(leagueId)) {
    return col;
  }
  return kind === 'players'
    ? query(col, limit(CITY_HUB_LIMITS.players))
    : query(col, orderBy('updatedAt', 'desc'), limit(CITY_HUB_LIMITS[kind]));
}

export function playerDocRef(leagueId: string, playerId: string): DocumentReference {
  return doc(leaguePlayersCol(leagueId), playerId);
}

export function matchDocRef(leagueId: string, matchId: string): DocumentReference {
  return doc(leagueMatchesCol(leagueId), matchId);
}

export function raceDocRef(leagueId: string, raceId: string): DocumentReference {
  return doc(leagueRacesCol(leagueId), raceId);
}

export function eventDocRef(leagueId: string, eventId: string): DocumentReference {
  return doc(leagueEventsCol(leagueId), eventId);
}

export function leagueInviteDocRef(code: string): DocumentReference {
  return doc(requireFirestore(), 'leagueInvites', code.toUpperCase());
}

export function playerProfileDocRef(uid: string): DocumentReference {
  return doc(requireFirestore(), 'playerProfiles', uid);
}

export function challengesCol(): CollectionReference {
  return collection(requireFirestore(), 'challenges');
}

export function challengeDocRef(challengeId: string): DocumentReference {
  return doc(requireFirestore(), 'challenges', challengeId);
}

export function lookingPostsCol(): CollectionReference {
  return collection(requireFirestore(), 'lookingPosts');
}

export function lookingPostDocRef(postId: string): DocumentReference {
  return doc(requireFirestore(), 'lookingPosts', postId);
}

export function directoryListingsCol(): CollectionReference {
  return collection(requireFirestore(), 'directoryListings');
}

export function directoryListingDocRef(listingId: string): DocumentReference {
  return doc(requireFirestore(), 'directoryListings', listingId);
}

export function followsCol(): CollectionReference {
  return collection(requireFirestore(), 'follows');
}

export function followDocRef(followId: string): DocumentReference {
  return doc(requireFirestore(), 'follows', followId);
}

/** Strip undefined (Firestore rejects undefined field values). */
export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) {
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[key] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[key] = v;
    }
  }
  return out as T;
}

/**
 * User upserts use merge:true - never send null/empty membership fields or a
 * fresh Google session will wipe DOB, city, and leagueIds on returning users.
 */
export function cloudUserWritePayload(profile: Record<string, unknown>): Record<string, unknown> {
  const out = stripUndefined({ ...profile });
  for (const key of ['cityId', 'cityName', 'dateOfBirth', 'activeLeagueId'] as const) {
    if (out[key] == null || out[key] === '') {
      delete out[key];
    }
  }
  if (Array.isArray(out.leagueIds) && out.leagueIds.length === 0) {
    delete out.leagueIds;
  }
  return out;
}
