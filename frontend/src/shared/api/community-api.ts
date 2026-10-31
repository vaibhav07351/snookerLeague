import { ApiError, apiRequest } from '@/shared/api/client';

/** Documents that live outside any league (see backend/internal/community). */
export type CommunityKind =
  | 'user'
  | 'profile'
  | 'directory'
  | 'looking'
  | 'follow'
  | 'challenge'
  | 'block'
  | 'report'
  | 'device';

export interface CommunityListParams {
  city?: string;
  subKind?: string;
  /** Follows: rows created by this user ("who do they follow"). */
  owner?: string;
  /** Follows: rows about this user ("who follows them"). */
  subject?: string;
  /** Challenges: my "sent" or "received" box. */
  box?: 'sent' | 'received';
  cursor?: string;
  limit?: number;
}

export interface CommunityPage<T> {
  items: T[];
  /** Pass back to get the next page; '' when there is none. */
  cursor: string;
  hasMore: boolean;
}

function docPath(kind: CommunityKind, id: string): string {
  return `/v1/community/${kind}/${encodeURIComponent(id)}`;
}

export function putCommunityDoc(
  kind: CommunityKind,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  return apiRequest<void>(docPath(kind, id), { method: 'PUT', body: data });
}

export function deleteCommunityDoc(kind: CommunityKind, id: string): Promise<void> {
  return apiRequest<void>(docPath(kind, id), { method: 'DELETE' });
}

/** One document, or null when it does not exist (or is not mine to read). */
export async function getCommunityDoc<T>(kind: CommunityKind, id: string): Promise<T | null> {
  try {
    return await apiRequest<T>(docPath(kind, id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function listCommunityDocs<T>(
  kind: CommunityKind,
  params: CommunityListParams,
): Promise<CommunityPage<T>> {
  return apiRequest<CommunityPage<T>>(`/v1/community/${kind}`, {
    query: { ...params },
  });
}
