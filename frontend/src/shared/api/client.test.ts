import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SessionTokens } from '@/shared/api/tokens';

let mockTokens: SessionTokens | null = null;
jest.mock('@/shared/api/tokens', () => ({
  getTokens: () => mockTokens,
  saveTokens: async (t: SessionTokens) => {
    mockTokens = t;
  },
  clearTokens: async () => {
    mockTokens = null;
  },
}));
jest.mock('@/shared/config/env', () => ({
  getApiBaseUrl: () => 'https://api.test',
  isCloudEnabled: () => true,
}));
jest.mock('@/shared/ui/notify', () => ({
  notify: { error: jest.fn(), info: jest.fn(), success: jest.fn() },
}));

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function respond(status: number, body: unknown = {}): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type FetchArgs = [url: string, init: { headers?: Record<string, string>; body?: string }];
const fetchMock = jest.fn<(...args: FetchArgs) => Promise<FakeResponse>>();

type Client = typeof import('@/shared/api/client');

function fresh(): Client {
  let mod: Client | undefined;
  jest.isolateModules(() => {
    mod = require('@/shared/api/client') as Client;
  });
  if (!mod) {
    throw new Error('module not loaded');
  }
  return mod;
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const expired = () => new Date(Date.now() - 1_000).toISOString();

function session(over: Partial<SessionTokens> = {}): SessionTokens {
  return {
    uid: 'u1',
    accessToken: 'old-access',
    accessExpiresAt: inAnHour(),
    refreshToken: 'refresh-1',
    ...over,
  };
}

const isRefresh = (url: string) => url.endsWith('/v1/auth/refresh');
const bearerOf = (init: FetchArgs[1]) => init.headers?.Authorization;

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  mockTokens = null;
});

describe('apiRequest token refresh', () => {
  it('refreshes an expired token once for requests made at the same time', async () => {
    const client = fresh();
    mockTokens = session({ accessExpiresAt: expired() });
    fetchMock.mockImplementation(async (url) =>
      isRefresh(url)
        ? respond(200, {
            accessToken: 'new-access',
            accessExpiresAt: inAnHour(),
            refreshToken: 'refresh-2',
          })
        : respond(200, { ok: true }),
    );

    await Promise.all([client.apiRequest('/v1/a'), client.apiRequest('/v1/b')]);

    const calls = fetchMock.mock.calls;
    expect(calls.filter(([url]) => isRefresh(url))).toHaveLength(1);
    const apiCalls = calls.filter(([url]) => !isRefresh(url));
    expect(apiCalls.map(([, init]) => bearerOf(init))).toEqual([
      'Bearer new-access',
      'Bearer new-access',
    ]);
    expect(mockTokens?.refreshToken).toBe('refresh-2');
  });

  it('refreshes and retries once when the server says the token is no longer valid', async () => {
    const client = fresh();
    mockTokens = session();
    fetchMock.mockImplementation(async (url, init) => {
      if (isRefresh(url)) {
        return respond(200, {
          accessToken: 'new-access',
          accessExpiresAt: inAnHour(),
          refreshToken: 'refresh-2',
        });
      }
      return bearerOf(init) === 'Bearer new-access'
        ? respond(200, { done: true })
        : respond(401, { code: 'unauthorized', message: 'Sign in again.' });
    });

    await expect(client.apiRequest('/v1/a')).resolves.toEqual({ done: true });
  });

  it('forgets the session when the refresh token is refused', async () => {
    const client = fresh();
    mockTokens = session({ accessExpiresAt: expired() });
    fetchMock.mockResolvedValue(respond(401, { code: 'unauthorized', message: 'No' }));

    await expect(client.apiRequest('/v1/a')).rejects.toMatchObject({ status: 401 });
    expect(mockTokens).toBeNull();
  });

  it('reports no answer as a NetworkError, and an error answer as an ApiError', async () => {
    const client = fresh();
    mockTokens = session();
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(client.apiRequest('/v1/a')).rejects.toBeInstanceOf(client.NetworkError);

    fetchMock.mockResolvedValueOnce(respond(409, { code: 'conflict', message: 'Taken' }));
    await expect(client.apiRequest('/v1/a')).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
    });
  });
});
