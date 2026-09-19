import {
  collection,
  doc,
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
  // Firestore rules require request.auth — local AsyncStorage session alone is not enough.
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

export function playerProfileDocRef(uid: string): DocumentReference {
  return doc(requireFirestore(), 'playerProfiles', uid);
}

export function challengesCol(): CollectionReference {
  return collection(requireFirestore(), 'challenges');
}

export function challengeDocRef(challengeId: string): DocumentReference {
  return doc(requireFirestore(), 'challenges', challengeId);
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
