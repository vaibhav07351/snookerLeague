import { FirebaseError } from 'firebase/app';
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentReference,
} from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import {
  MATCH_SETTINGS_FIELDS,
  type CloudUserProfile,
  type PendingOp,
} from '@/shared/types/domain';
import {
  eventDocRef,
  challengeDocRef,
  directoryListingDocRef,
  followDocRef,
  leagueDocRef,
  leagueInviteDocRef,
  lookingPostDocRef,
  matchDocRef,
  playerDocRef,
  playerProfileDocRef,
  raceDocRef,
  cloudUserWritePayload,
  stripUndefined,
  userDocRef,
} from '@/shared/sync/firestore-paths';

const WRITE_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), WRITE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function pushPendingOp(op: PendingOp): Promise<void> {
  if (op.action === 'delete') {
    await withTimeout(deleteRemote(op), `delete ${op.entity}/${op.docId}`);
    return;
  }
  if (op.payload == null) {
    throw new Error(`Missing payload for upsert ${op.entity}/${op.docId}`);
  }
  await withTimeout(upsertRemote(op), `upsert ${op.entity}/${op.docId}`);
}

function omit(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out = { ...data };
  for (const key of keys) {
    delete out[key];
  }
  return out;
}

function pick(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in data) {
      out[key] = data[key];
    }
  }
  return out;
}

/**
 * Update only `fields`; if the document does not exist yet, create it from `full`.
 * Shared documents are never rewritten wholesale, so a stale copy on one phone cannot undo
 * changes other phones made to fields it does not own.
 */
async function updateOrCreate(
  ref: DocumentReference,
  fields: Record<string, unknown>,
  full: Record<string, unknown>,
): Promise<void> {
  try {
    await updateDoc(ref, fields);
  } catch (error) {
    // A missing document can surface as not-found or, when rules cannot read it, as
    // permission-denied. Only create when it really does not exist yet.
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'not-found' || code === 'permission-denied') {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, full);
        return;
      }
    }
    throw error;
  }
}

/**
 * League fields never sent by a plain save: membership changes only via join/leave ops,
 * and the invite code only via the owner's "new code" (fieldsOnly).
 */
const LEAGUE_SERVER_FIELDS = ['memberUids', 'createdByUid', 'inviteCode'] as const;

async function upsertLeague(op: PendingOp, data: Record<string, unknown>): Promise<void> {
  const ref = leagueDocRef(op.docId);
  if (op.membership) {
    const change = op.membership.add
      ? { memberUids: arrayUnion(op.membership.add) }
      : op.membership.remove
        ? { memberUids: arrayRemove(op.membership.remove) }
        : {};
    await updateOrCreate(ref, { ...change, updatedAt: data.updatedAt }, data);
    return;
  }
  if (op.fieldsOnly) {
    await updateOrCreate(ref, pick(data, op.fieldsOnly), data);
    return;
  }
  await updateOrCreate(ref, omit(data, LEAGUE_SERVER_FIELDS), data);
}

async function upsertMatch(op: PendingOp, data: Record<string, unknown>): Promise<void> {
  if (!op.leagueId) {
    throw new Error('match upsert requires leagueId');
  }
  const ref = matchDocRef(op.leagueId, op.docId);
  if (op.fieldsOnly) {
    await updateDoc(ref, pick(data, op.fieldsOnly));
    return;
  }
  // Scorer saves never carry settings (scorer, policy, title): those change on their own.
  await updateOrCreate(ref, omit(data, [...MATCH_SETTINGS_FIELDS, 'createdByUid']), data);
}

/**
 * The profile's league list only grows here (arrayUnion), so two phones never overwrite
 * each other's lists; leaving a league removes it explicitly (membership.remove).
 */
async function upsertUser(op: PendingOp, data: Record<string, unknown>): Promise<void> {
  const ref = userDocRef(op.docId);
  if (op.membership?.remove) {
    await updateDoc(ref, { leagueIds: arrayRemove(op.membership.remove) });
    return;
  }
  const leagueIds = Array.isArray(data.leagueIds) ? (data.leagueIds as string[]) : [];
  const { leagueIds: _ignored, ...rest } = data;
  await setDoc(
    ref,
    leagueIds.length > 0 ? { ...rest, leagueIds: arrayUnion(...leagueIds) } : rest,
    { merge: true },
  );
}

async function upsertRemote(op: PendingOp): Promise<void> {
  const raw = stripUndefined(op.payload as Record<string, unknown>);
  const data = op.entity === 'user' ? cloudUserWritePayload(raw) : raw;
  switch (op.entity) {
    case 'user':
      await upsertUser(op, data);
      return;
    case 'league':
      await upsertLeague(op, data);
      return;
    case 'player':
      if (!op.leagueId) {
        throw new Error('player upsert requires leagueId');
      }
      if (op.fieldsOnly) {
        // e.g. stats only: never rewrite the name or owner from a stale copy.
        await updateOrCreate(playerDocRef(op.leagueId, op.docId), pick(data, op.fieldsOnly), data);
        return;
      }
      await setDoc(playerDocRef(op.leagueId, op.docId), data, { merge: true });
      return;
    case 'match':
      await upsertMatch(op, data);
      return;
    case 'race':
      if (!op.leagueId) {
        throw new Error('race upsert requires leagueId');
      }
      await setDoc(raceDocRef(op.leagueId, op.docId), data, { merge: true });
      return;
    case 'event':
      if (!op.leagueId) {
        throw new Error('event upsert requires leagueId');
      }
      await setDoc(eventDocRef(op.leagueId, op.docId), data, { merge: true });
      return;
    case 'profile':
      await setDoc(playerProfileDocRef(op.docId), data, { merge: true });
      return;
    case 'challenge':
      await setDoc(challengeDocRef(op.docId), data, { merge: true });
      return;
    case 'looking':
      await setDoc(lookingPostDocRef(op.docId), data, { merge: true });
      return;
    case 'directory':
      await setDoc(directoryListingDocRef(op.docId), data, { merge: true });
      return;
    case 'follow':
      await setDoc(followDocRef(op.docId), data, { merge: true });
      return;
    case 'invite':
      await setDoc(leagueInviteDocRef(op.docId), data, { merge: true });
      return;
    default:
      throw new Error(`Unknown entity ${op.entity as string}`);
  }
}

async function deleteRemote(op: PendingOp): Promise<void> {
  switch (op.entity) {
    case 'user':
      await deleteDoc(userDocRef(op.docId));
      return;
    case 'league':
      await deleteDoc(leagueDocRef(op.docId));
      return;
    case 'player':
      if (!op.leagueId) {
        throw new Error('player delete requires leagueId');
      }
      await deleteDoc(playerDocRef(op.leagueId, op.docId));
      return;
    case 'match':
      if (!op.leagueId) {
        throw new Error('match delete requires leagueId');
      }
      await deleteDoc(matchDocRef(op.leagueId, op.docId));
      return;
    case 'race':
      if (!op.leagueId) {
        throw new Error('race delete requires leagueId');
      }
      await deleteDoc(raceDocRef(op.leagueId, op.docId));
      return;
    case 'event':
      if (!op.leagueId) {
        throw new Error('event delete requires leagueId');
      }
      await deleteDoc(eventDocRef(op.leagueId, op.docId));
      return;
    case 'profile':
      await deleteDoc(playerProfileDocRef(op.docId));
      return;
    case 'challenge':
      await deleteDoc(challengeDocRef(op.docId));
      return;
    case 'looking':
      await deleteDoc(lookingPostDocRef(op.docId));
      return;
    case 'directory':
      await deleteDoc(directoryListingDocRef(op.docId));
      return;
    case 'follow':
      await deleteDoc(followDocRef(op.docId));
      return;
    case 'invite':
      await deleteDoc(leagueInviteDocRef(op.docId));
      return;
    default:
      throw new Error(`Unknown entity ${op.entity as string}`);
  }
}

/**
 * Add the signed-in user to a league they were invited to. Online only: this is the one
 * league write a non-member may make, and the rules accept it only with the league's
 * current invite code and no other change. Safe to repeat (arrayUnion).
 */
export async function joinLeagueRemote(
  leagueId: string,
  code: string,
  uid: string,
  at: string,
): Promise<void> {
  await withTimeout(
    updateDoc(leagueDocRef(leagueId), {
      memberUids: arrayUnion(uid),
      lastJoinCode: code.toUpperCase(),
      updatedAt: at,
    }),
    `join league/${leagueId}`,
  );
}

export async function upsertCloudUser(profile: CloudUserProfile): Promise<void> {
  try {
    await withTimeout(
      upsertUser(
        {
          opId: 'direct',
          entity: 'user',
          docId: profile.uid,
          leagueId: null,
          action: 'upsert',
          payload: profile,
          updatedAt: profile.updatedAt,
          attempts: 0,
        },
        cloudUserWritePayload({ ...profile }),
      ),
      `upsert user/${profile.uid}`,
    );
  } catch (error) {
    logger.error('sync.push', 'Failed to upsert cloud user', {
      shape: error instanceof Error ? error.name : 'unknown',
      uid: profile.uid,
    });
    throw error;
  }
}
