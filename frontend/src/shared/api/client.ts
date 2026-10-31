import { getApiBaseUrl } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import { clearTokens, getTokens, saveTokens, type SessionTokens } from '@/shared/api/tokens';
import { notify } from '@/shared/ui/notify';

const DEFAULT_TIMEOUT_MS = 20_000;
/** Refresh a little before the access token expires, so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 30_000;

/** The server answered with an error: `{ code, message }` plus the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** No answer at all: offline, timed out, or the server could not be reached. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

type Query = Record<string, string | number | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Send the access token (default true). */
  auth?: boolean;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: Query): string {
  const base = getApiBaseUrl();
  if (!base) {
    throw new NetworkError('The Snookit API address is not configured');
  }
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return `${base}${path}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}

async function send(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new NetworkError(aborted ? 'Request timed out' : 'Network request failed');
  } finally {
    clearTimeout(timer);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    return new ApiError(
      res.status,
      typeof body.code === 'string' ? body.code : 'http_error',
      typeof body.message === 'string' ? body.message : `Request failed (${res.status})`,
    );
  } catch {
    return new ApiError(res.status, 'http_error', `Request failed (${res.status})`);
  }
}

interface TokenPairResponse {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
}

let refreshing: Promise<SessionTokens | null> | null = null;
let lastExpiredNoticeAt = 0;

/**
 * Swap the refresh token for a new pair. Single-flight: every request that finds the access
 * token expired waits for the same refresh, because the server rotates refresh tokens and a
 * second use of the old one would look like theft.
 */
function refreshSession(): Promise<SessionTokens | null> {
  refreshing ??= (async () => {
    const current = getTokens();
    if (!current) {
      return null;
    }
    const res = await send(
      buildUrl('/v1/auth/refresh'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      },
      DEFAULT_TIMEOUT_MS,
    );
    if (res.status === 401) {
      await endExpiredSession();
      return null;
    }
    if (!res.ok) {
      throw await errorFrom(res);
    }
    const pair = (await res.json()) as TokenPairResponse;
    const next: SessionTokens = { uid: current.uid, ...pair };
    await saveTokens(next);
    return next;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** The server no longer accepts this session: forget it and ask the user to sign in again. */
async function endExpiredSession(): Promise<void> {
  logger.warn('api.client', 'Session expired; cloud sync paused until the next sign-in');
  await clearTokens();
  const now = Date.now();
  if (now - lastExpiredNoticeAt > 60_000) {
    lastExpiredNoticeAt = now;
    notify.error(
      'Signed out of online sync',
      'Your changes stay on this phone. Sign out and sign in with Google again to sync.',
    );
  }
}

/** A valid access token, refreshed first when it is about to expire (for the live socket). */
export async function freshAccessToken(): Promise<string> {
  return accessToken();
}

async function accessToken(): Promise<string> {
  let tokens = getTokens();
  if (!tokens) {
    throw new ApiError(401, 'unauthorized', 'Sign in again.');
  }
  if (Date.parse(tokens.accessExpiresAt) - Date.now() < EXPIRY_MARGIN_MS) {
    tokens = await refreshSession();
    if (!tokens) {
      throw new ApiError(401, 'unauthorized', 'Sign in again.');
    }
  }
  return tokens.accessToken;
}

/**
 * Call the Snookit API. Resolves with the parsed JSON body (undefined for 204), rejects with
 * ApiError for an error answer and NetworkError when there was no answer. An expired access
 * token is refreshed once and the request retried.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = buildUrl(path, query);

  const attempt = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return send(
      url,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
      timeoutMs,
    );
  };

  let res = await attempt(auth ? await accessToken() : null);
  if (auth && res.status === 401) {
    const renewed = await refreshSession();
    if (!renewed) {
      throw new ApiError(401, 'unauthorized', 'Sign in again.');
    }
    res = await attempt(renewed.accessToken);
  }
  if (!res.ok) {
    throw await errorFrom(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Error fields that are safe to log (never tokens or request bodies). */
export function apiErrorMeta(error: unknown): { shape: string; status?: number; code?: string } {
  if (error instanceof ApiError) {
    return { shape: 'ApiError', status: error.status, code: error.code };
  }
  if (error instanceof Error) {
    return { shape: error.name };
  }
  return { shape: 'unknown' };
}
