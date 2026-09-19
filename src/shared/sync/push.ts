import { deleteDoc, setDoc } from 'firebase/firestore';

import { logger } from '@/shared/logging/logger';
import type { CloudUserProfile, PendingOp } from '@/shared/types/domain';
import {
  eventDocRef,
  challengeDocRef,
  directoryListingDocRef,
  followDocRef,
  leagueDocRef,
  lookingPostDocRef,
  matchDocRef,
  playerDocRef,
  playerProfileDocRef,
  raceDocRef,
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

async function upsertRemote(op: PendingOp): Promise<void> {
  const data = stripUndefined(op.payload as Record<string, unknown>);
  switch (op.entity) {
    case 'user':
      await setDoc(userDocRef(op.docId), data, { merge: true });
      return;
    case 'league':
      await setDoc(leagueDocRef(op.docId), data, { merge: true });
      return;
    case 'player':
      if (!op.leagueId) {
        throw new Error('player upsert requires leagueId');
      }
      await setDoc(playerDocRef(op.leagueId, op.docId), data, { merge: true });
      return;
    case 'match':
      if (!op.leagueId) {
        throw new Error('match upsert requires leagueId');
      }
      await setDoc(matchDocRef(op.leagueId, op.docId), data, { merge: true });
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
    default:
      throw new Error(`Unknown entity ${op.entity as string}`);
  }
}

export async function upsertCloudUser(profile: CloudUserProfile): Promise<void> {
  try {
    await withTimeout(
      setDoc(userDocRef(profile.uid), stripUndefined({ ...profile }), { merge: true }),
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
