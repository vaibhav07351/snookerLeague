import { ApiError } from '@/shared/api/client';
import { deleteCommunityDoc, putCommunityDoc } from '@/shared/api/community-api';
import {
  joinCityHub,
  leaveLeague,
  pushOps,
  type DocEntity,
  type PushOp,
  type PushResult,
  type ServerDoc,
} from '@/shared/api/sync-api';
import { logger } from '@/shared/logging/logger';
import { getStore } from '@/shared/storage/local-store';
import {
  localRowOf,
  recordVersion,
  replaceWithServerDoc,
  storeRebasedRow,
} from '@/shared/sync/apply';
import { removeLeagueLocally } from '@/shared/sync/cloud-leagues';
import { sameJson, toJsonObject, versionKey } from '@/shared/sync/mappers';
import { lastWriteWins, resolveLeague, resolveMatch } from '@/shared/sync/merge';
import { RejectedWriteError } from '@/shared/sync/sync-errors';
import {
  cityHubId,
  type FeedEvent,
  type League,
  type Match,
  type PendingOp,
  type Player,
  type Race,
} from '@/shared/types/domain';

/** What happened to one queued write. */
export type PushOutcome =
  | { status: 'applied' }
  /** The server held a newer copy and the merged result is exactly the server's: nothing to send. */
  | { status: 'resolved' }
  /** Merged with a newer server copy; send again (with `payload` when the write changed). */
  | { status: 'retry'; payload?: unknown }
  | { status: 'rejected'; error: RejectedWriteError };

/** Documents versioned by /v1/sync (everything else goes to its own endpoint). */
const DOC_ENTITIES: readonly string[] = ['league', 'player', 'match', 'race', 'event'];

/** True for a plain write of a league document, which can travel in a batched push. */
export function isBatchable(op: PendingOp): boolean {
  return DOC_ENTITIES.includes(op.entity) && !op.membership;
}

type Row = League | Player | Match | Race | FeedEvent;

function pick(data: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in data) {
      out[key] = data[key];
    }
  }
  return out;
}

function localRow(entity: DocEntity, id: string): Row | undefined {
  const s = getStore();
  switch (entity) {
    case 'league':
      return s.leagues.find((r) => r.id === id);
    case 'player':
      return s.players.find((r) => r.id === id);
    case 'match':
      return s.matches.find((r) => r.id === id);
    case 'race':
      return s.races.find((r) => r.id === id);
    case 'event':
      return s.events.find((r) => r.id === id);
  }
}

/**
 * The whole document to send. A field-only write (stats, a title, match settings) is laid
 * over this phone's current copy, which is the server's copy plus our own changes: the
 * baseVersion check then guarantees we never overwrite fields someone else changed.
 */
function documentFor(op: PendingOp): Record<string, unknown> {
  const payload = toJsonObject(op.payload);
  if (!op.fieldsOnly) {
    return payload;
  }
  const base = localRow(op.entity as DocEntity, op.docId);
  return { ...toJsonObject(base ?? payload), ...pick(payload, op.fieldsOnly) };
}

function toPushOp(op: PendingOp): PushOp {
  const entity = op.entity as DocEntity;
  const leagueId = entity === 'league' ? op.docId : (op.leagueId ?? '');
  return {
    opId: op.opId,
    entity,
    id: op.docId,
    leagueId,
    action: op.action,
    baseVersion: getStore().serverVersions[versionKey(entity, op.docId)] ?? 0,
    ...(op.action === 'upsert' ? { data: documentFor(op) } : {}),
  };
}

function resolverFor(entity: DocEntity): (local: Row, remote: Row) => Row {
  switch (entity) {
    case 'league':
      return (l, r) => resolveLeague(l as League, r as League, false);
    case 'match':
      return (l, r) => resolveMatch(l as Match, r as Match, false);
    default:
      return (l, r) => lastWriteWins(l, r, false);
  }
}

/**
 * The server holds a newer copy than the one this write was based on. Merge with the same
 * rules a pull uses; if the server's copy already wins, the write is done.
 */
async function rebase(op: PendingOp, current: ServerDoc | null | undefined): Promise<PushOutcome> {
  const entity = op.entity as DocEntity;
  if (!current) {
    // Gone from the server without a tombstone (never fully created): send it as new.
    await recordVersion(entity, op.docId, 0);
    return { status: 'retry' };
  }
  if (op.action === 'delete') {
    await recordVersion(entity, op.docId, current.version);
    return { status: 'retry' }; // a delete wins over edits made meanwhile
  }
  const server = localRowOf(current);
  if (!server) {
    await replaceWithServerDoc(current);
    return { status: 'resolved' };
  }
  if (op.fieldsOnly) {
    const patched = { ...server, ...pick(toJsonObject(op.payload), op.fieldsOnly) } as Row;
    await storeRebasedRow(entity, patched, current.version);
    return { status: 'retry' };
  }
  const mine = (localRowOf({ ...current, data: toJsonObject(op.payload) }) ?? server) as Row;
  const merged = resolverFor(entity)(mine, server);
  if (sameJson(merged, server)) {
    await replaceWithServerDoc(current);
    return { status: 'resolved' };
  }
  await storeRebasedRow(entity, merged, current.version);
  return { status: 'retry', payload: merged };
}

async function outcomeOf(op: PendingOp, result: PushResult): Promise<PushOutcome> {
  const entity = op.entity as DocEntity;
  switch (result.status) {
    case 'applied':
      await recordVersion(entity, op.docId, result.version ?? 0);
      return { status: 'applied' };
    case 'conflict':
      return rebase(op, result.current);
    default:
      if (result.code === 'deleted' || (op.action === 'delete' && result.code === 'not_found')) {
        // Someone deleted it: follow the server instead of reporting an error.
        if (entity === 'league') {
          await removeLeagueLocally(op.docId);
        }
        return { status: 'resolved' };
      }
      return {
        status: 'rejected',
        error: new RejectedWriteError(result.code ?? 'rejected', result.message ?? 'Refused'),
      };
  }
}

/** Send up to 100 league-document writes in one request; one outcome per op, in order. */
export async function pushDocBatch(ops: PendingOp[]): Promise<PushOutcome[]> {
  const results = await pushOps(ops.map(toPushOp));
  const outcomes: PushOutcome[] = [];
  for (const [i, op] of ops.entries()) {
    const result = results[i];
    if (!result || result.opId !== op.opId) {
      throw new Error('Push results do not match the request');
    }
    outcomes.push(await outcomeOf(op, result));
  }
  return outcomes;
}

/** Join or leave a league (city hubs are created on the server by the first join). */
async function pushMembership(op: PendingOp): Promise<PushOutcome> {
  const league = op.payload as Partial<League> | null;
  if (op.membership?.add) {
    const cityId = league?.cityId ?? (op.docId.startsWith('city_') ? op.docId.slice(5) : null);
    if (!cityId || op.docId !== cityHubId(cityId)) {
      // Club leagues are joined online with an invite code, never through the queue.
      logger.warn('sync.push', 'Dropping a queued join for a club league', { leagueId: op.docId });
      return { status: 'resolved' };
    }
    const cityName = getStore().user?.cityName ?? cityId;
    await replaceWithServerDoc(await joinCityHub(cityId, cityName));
    return { status: 'applied' };
  }
  if (op.membership?.remove) {
    try {
      await replaceWithServerDoc(await leaveLeague(op.docId));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'not_member') {
        return { status: 'resolved' }; // already out
      }
      throw error;
    }
    return { status: 'applied' };
  }
  return { status: 'resolved' };
}

/** Send one queued write that is not a plain league-document write. */
export async function pushSingle(op: PendingOp): Promise<PushOutcome> {
  if (op.membership && DOC_ENTITIES.includes(op.entity)) {
    return pushMembership(op);
  }
  switch (op.entity) {
    case 'invite':
      // The server finds leagues by the inviteCode inside the league itself.
      return { status: 'resolved' };
    case 'user':
      if (op.membership) {
        return { status: 'resolved' }; // the server derives my leagues from membership
      }
      break;
    case 'profile':
    case 'challenge':
    case 'looking':
    case 'directory':
    case 'follow':
      break;
    default:
      throw new Error(`Unexpected queued write for ${op.entity}`);
  }
  if (op.action === 'delete') {
    await deleteCommunityDoc(op.entity, op.docId);
  } else {
    await putCommunityDoc(op.entity, op.docId, toJsonObject(op.payload));
  }
  return { status: 'applied' };
}
