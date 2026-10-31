import { apiRequest } from '@/shared/api/client';

/** League-scoped document kinds the server versions and syncs. */
export type DocEntity = 'league' | 'player' | 'match' | 'race' | 'event' | 'tournament';

/** One stored document. Deleted documents are tombstones with no data. */
export interface ServerDoc {
  entity: DocEntity;
  id: string;
  leagueId: string;
  version: number;
  deleted: boolean;
  data?: Record<string, unknown>;
  updatedAt: string;
}

export interface PushOp {
  opId: string;
  entity: DocEntity;
  id: string;
  leagueId: string;
  action: 'upsert' | 'delete';
  /** The server version this phone last saw (0 for a new document). */
  baseVersion: number;
  data?: Record<string, unknown>;
}

export interface PushResult {
  opId: string;
  status: 'applied' | 'conflict' | 'rejected';
  version?: number;
  /** The server's copy, sent with a conflict. */
  current?: ServerDoc | null;
  code?: string;
  message?: string;
}

export interface PullPage {
  docs: ServerDoc[];
  cursor: number;
  hasMore: boolean;
}

export interface InvitePreview {
  code: string;
  leagueId: string;
  leagueName: string;
}

export async function pushOps(ops: PushOp[]): Promise<PushResult[]> {
  const res = await apiRequest<{ results: PushResult[] }>('/v1/sync/push', {
    method: 'POST',
    body: { ops },
  });
  return res.results;
}

/** Changes after `since` in every league I belong to, or in one league when given. */
export function pullPage(since: number, leagueId?: string): Promise<PullPage> {
  return apiRequest<PullPage>('/v1/sync/pull', {
    query: { since, limit: 500, league: leagueId },
    timeoutMs: 30_000,
  });
}

export function fetchInvite(code: string): Promise<InvitePreview> {
  return apiRequest<InvitePreview>(`/v1/invites/${encodeURIComponent(code)}`);
}

export async function joinLeagueByCode(code: string): Promise<ServerDoc> {
  const res = await apiRequest<{ league: ServerDoc }>('/v1/leagues/join', {
    method: 'POST',
    body: { code },
  });
  return res.league;
}

export async function leaveLeague(leagueId: string): Promise<ServerDoc> {
  const res = await apiRequest<{ league: ServerDoc }>(
    `/v1/leagues/${encodeURIComponent(leagueId)}/leave`,
    { method: 'POST' },
  );
  return res.league;
}

export async function joinCityHub(cityId: string, cityName: string): Promise<ServerDoc> {
  const res = await apiRequest<{ league: ServerDoc }>(
    `/v1/cities/${encodeURIComponent(cityId)}/join`,
    { method: 'POST', body: { cityName } },
  );
  return res.league;
}
