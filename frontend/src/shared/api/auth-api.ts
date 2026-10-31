import { apiRequest } from '@/shared/api/client';
import { clearTokens, saveTokens, type SessionTokens } from '@/shared/api/tokens';

/** The signed-in account as the server describes it. */
export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  photoUrl: string;
}

interface SignInResponse {
  user: ApiUser;
  tokens: { accessToken: string; accessExpiresAt: string; refreshToken: string };
}

/** Exchange a Google id token for a Snookit session and remember its tokens. */
export async function signInWithGoogle(idToken: string): Promise<ApiUser> {
  const res = await apiRequest<SignInResponse>('/v1/auth/google', {
    method: 'POST',
    body: { idToken },
    auth: false,
  });
  const tokens: SessionTokens = { uid: res.user.id, ...res.tokens };
  await saveTokens(tokens);
  return res.user;
}

/** End the session on the server (best effort) and forget it on this phone either way. */
export async function signOutOfApi(): Promise<void> {
  try {
    await apiRequest<void>('/v1/auth/logout', { method: 'POST', timeoutMs: 8_000 });
  } finally {
    await clearTokens();
  }
}

/** Delete the account and its data on the server, then forget the session on this phone. */
export async function deleteAccountOnServer(): Promise<void> {
  await apiRequest<void>('/v1/me', { method: 'DELETE', timeoutMs: 60_000 });
  await clearTokens();
}
