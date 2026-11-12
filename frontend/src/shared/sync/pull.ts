import { ApiError } from '@/shared/api/client';
import { getCommunityDoc } from '@/shared/api/community-api';
import { fetchInvite, pullPage, type ServerDoc } from '@/shared/api/sync-api';
import { logger } from '@/shared/logging/logger';
import { getStore, updateStore } from '@/shared/storage/local-store';
import { applyServerDocs } from '@/shared/sync/apply';
import { dropUnreachableLeague } from '@/shared/sync/cloud-leagues';
import { syncErrorMeta } from '@/shared/sync/sync-errors';
import { leagueKindOf, type CloudUserProfile, type LeagueInvite } from '@/shared/types/domain';

/** Stop after this many pages in one go; the next pull continues from the saved cursor. */
const MAX_PAGES_PER_PULL = 40;

/**
 * Bump when OPT_IN_KINDS gains a kind. Documents of that kind written while this phone ran an
 * older build were hidden from it but already sit behind its cursor, so the first pull on the
 * new build starts again from 0 (merging is idempotent, so this is only extra traffic).
 */
const PULL_KINDS_VERSION = 1;

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
  if (getStore().pullKindsVersion < PULL_KINDS_VERSION) {
    logger.info('sync.pull', 'New document kinds: pulling full history once', {
      from: getStore().pullKindsVersion,
      to: PULL_KINDS_VERSION,
    });
    await updateStore((s) => ({ ...s, syncCursor: 0, pullKindsVersion: PULL_KINDS_VERSION }));
  }
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

/**
 * One league's complete history, held in memory instead of merged page by page, for callers
 * that must treat it as the full server truth. Throws rather than return a partial history.
 */
export async function fetchLeagueHistory(leagueId: string): Promise<ServerDoc[]> {
  const docs: ServerDoc[] = [];
  let since = 0;
  for (let pages = 0; pages < MAX_PAGES_PER_PULL; pages += 1) {
    const page = await pullPage(since, leagueId);
    docs.push(...page.docs);
    if (!page.hasMore) {
      return docs;
    }
    since = page.cursor;
  }
  throw new Error('League history is too long to fetch in one go');
}

/** The user's private settings saved on the server, or null for a first sign-in. */
export async function fetchCloudUser(uid: string): Promise<CloudUserProfile | null> {
  return getCommunityDoc<CloudUserProfile>('user', uid);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The saved date of birth when it has the expected YYYY-MM-DD shape (the server checks it too). */
function validSavedDob(value: unknown): string | null {
  return typeof value === 'string' && ISO_DATE.test(value) ? value : null;
}

/**
 * Restore what the server remembers about this user (city, active league, date of birth) onto
 * the session. Leagues themselves come from the pull.
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
        termsAcceptedAt: s.user.termsAcceptedAt ?? profile?.termsAcceptedAt ?? null,
        dateOfBirth: s.user.dateOfBirth ?? validSavedDob(profile?.dateOfBirth),
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
