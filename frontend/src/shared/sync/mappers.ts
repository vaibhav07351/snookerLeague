import type { DocEntity } from '@/shared/api/sync-api';
import type { FeedEvent, League, Match, Player, Race } from '@/shared/types/domain';
import { emptyRaceStats, emptyStandardStats } from '@/shared/types/domain';

/** Stable fallback - never use nowIso() in mappers or every read looks like a change. */
const MISSING_TS = '1970-01-01T00:00:00.000Z';

type Data = Record<string, unknown>;

/** Key of a document in AppDataStore.serverVersions. */
export function versionKey(entity: DocEntity, id: string): string {
  return `${entity}:${id}`;
}

export function asLeague(data: Data, id: string): League {
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

export function asPlayer(data: Data, id: string, leagueId: string): Player {
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

export function asMatch(data: Data, id: string, leagueId: string): Match {
  return {
    ...(data as unknown as Match),
    id,
    leagueId: String(data.leagueId ?? leagueId),
  };
}

export function asRace(data: Data, id: string, leagueId: string): Race {
  return {
    ...(data as unknown as Race),
    id,
    leagueId: String(data.leagueId ?? leagueId),
  };
}

export function asEvent(data: Data, id: string, leagueId: string): FeedEvent {
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

/** Drop undefined values (JSON has no undefined; they would vanish on the server anyway). */
export function toJsonObject(value: unknown): Data {
  return JSON.parse(JSON.stringify(value ?? {})) as Data;
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortedKeys);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Data;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .filter((k) => obj[k] !== undefined)
        .map((k) => [k, sortedKeys(obj[k])]),
    );
  }
  return value;
}

/** Same JSON content, ignoring key order (Postgres JSONB does not keep key order). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));
}
