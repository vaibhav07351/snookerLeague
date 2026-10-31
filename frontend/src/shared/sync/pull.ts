import { ApiError } from '@/shared/api/client';
import { getCommunityDoc } from '@/shared/api/community-api';
import { fetchInvite, pullPage } from '@/shared/api/sync-api';
import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import { applyServerDocs } from '@/shared/sync/apply';
import { dropUnreachableLeague } from '@/shared/sync/cloud-leagues';
import { syncErrorMeta } from '@/shared/sync/sync-errors';
import { leagueKindOf, type CloudUserProfile, type LeagueInvite } from '@/shared/types/domain';

/** Stop after this many pages in one go; the next pull continues from the saved cursor. */
const MAX_PAGES_PER_PULL = 40;

let pulling: Promise<void> | null = null;

/**
 * Fetch everything that changed on the server since the last pull, in every league I belong
 * to, and merge it in. Single-flight: overlapping callers share one run.
 */
export function pullChanges(): Promise<void> {
  pulling ??= pullAll().finally(() => {
    pulling = null;
  });
  return pulling;
}

async function pullAll(): Promise<void> {
  for (let pages = 0; pages < MAX_PAGES_PER_PULL; pages += 1) {
    const since = getStore().syncCursor;
    const page = await pullPage(since);
    await applyServerDocs(page.docs);
    if (page.cursor > since) {
      await updateStore((s) =>
        s.syncCursor >= page.cursor ? s : { ...s, syncCursor: page.cursor },
      );
    }
    if (!page.hasMore) {
      return;
    }
  }
}

/**
 * Fetch one league's full history. Needed right after joining: its documents are older than
 * this phone's cursor, so the normal pull would never return them.
 */
export async function pullLeague(leagueId: string): Promise<void> {
  let since = 0;
  for (let pages = 0; pages < MAX_PAGES_PER_PULL; pages += 1) {
    let page;
    try {
      page = await pullPage(since, leagueId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        await dropUnreachableLeague(leagueId);
        return;
      }
      throw error;
    }
    await applyServerDocs(page.docs);
    if (!page.hasMore) {
      return;
    }
    since = page.cursor;
  }
}

/** The user's private settings saved on the server, or null for a first sign-in. */
export async function fetchCloudUser(uid: string): Promise<CloudUserProfile | null> {
  return getCommunityDoc<CloudUserProfile>('user', uid);
}

/**
 * Restore what the server remembers about this user (city, active league) onto the session.
 * Leagues themselves come from the pull, and the date of birth never leaves the phone.
 */
export async function restoreCloudUser(uid: string): Promise<void> {
  const profile = await fetchCloudUser(uid);
  await updateStore((s) => {
    const usable = (id: string | null | undefined): boolean =>
      id != null && s.leagues.some((l) => l.id === id && l.memberUids.includes(uid));
    let activeLeagueId = s.activeLeagueId;
    if (usable(profile?.activeLeagueId)) {
      activeLeagueId = profile!.activeLeagueId;
    } else if (!usable(activeLeagueId)) {
      activeLeagueId =
        s.leagues.find((l) => l.memberUids.includes(uid) && leagueKindOf(l) !== 'city')?.id ?? null;
    }
    if (!s.user || s.user.uid !== uid) {
      return { ...s, activeLeagueId };
    }
    return {
      ...s,
      activeLeagueId,
      user: {
        ...s.user,
        displayName: profile?.displayName || s.user.displayName,
        photoUrl: profile?.photoUrl ?? s.user.photoUrl,
        cityId: profile?.cityId ?? s.user.cityId,
        cityName: profile?.cityName ?? s.user.cityName,
      },
    };
  });
}

/** Resolve an invite code to its league, or null when the code is unknown. */
export async function fetchLeagueInvite(code: string): Promise<LeagueInvite | null> {
  const upper = code.trim().toUpperCase();
  try {
    const preview = await fetchInvite(upper);
    return {
      code: preview.code,
      leagueId: preview.leagueId,
      leagueName: preview.leagueName || 'League',
      createdByUid: '',
      updatedAt: new Date(0).toISOString(),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    logger.warn('sync.pull', 'Invite lookup failed', syncErrorMeta(error));
    throw error;
  }
}
