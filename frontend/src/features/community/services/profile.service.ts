import { z } from 'zod';

import {
  divisionFromDob,
  isSnookerDivision,
  parseAndValidateDob,
} from '@/features/auth/services/division.service';
import { memberPlayerId } from '@/features/players/services/players.service';
import { apiErrorMeta } from '@/shared/api/client';
import { getCommunityDoc, listCommunityDocs } from '@/shared/api/community-api';
import { AppError } from '@/shared/errors/app-error';
import { pendingDocIdsOf } from '@/shared/sync/merge';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync, scheduleUserProfileSync } from '@/shared/sync';
import { isOnline } from '@/shared/sync/connectivity';
import { isBlocked } from '@/features/community/services/safety.service';
import { shouldCloudSync } from '@/shared/sync/cloud-session';
import {
  emptyPlayerProfile,
  leagueKindOf,
  type Player,
  type PlayerProfile,
  type SnookerDivision,
} from '@/shared/types/domain';
import { nowIso } from '@/shared/utils/id';

const CITY_PAGE = 20;
const MIN_GAMES_FOR_RANK = 3;

const patchSchema = z.object({
  cityId: z.string().nullable().optional(),
  cityName: z.string().nullable().optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  photoUrl: z.string().nullable().optional(),
  division: z.enum(['u16', 'u18', 'u21', 'open', 'masters', 'seniors']).nullable().optional(),
});

export function rankScore(played: number, winPct: number): number {
  if (played < MIN_GAMES_FOR_RANK) {
    return 0;
  }
  return Math.round(winPct * Math.log(played + 1) * 100) / 100;
}

export function profileFromStore(uid: string): PlayerProfile | null {
  return getStore().playerProfiles.find((p) => p.uid === uid) ?? null;
}

export async function upsertOwnProfile(patch: {
  cityId?: string | null;
  cityName?: string | null;
  displayName?: string;
  photoUrl?: string | null;
  division?: SnookerDivision | null;
}): Promise<PlayerProfile> {
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid profile details');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }

  const existing = profileFromStore(user.uid);
  const now = nowIso();
  const next: PlayerProfile = {
    ...(existing ?? emptyPlayerProfile(user.uid, user.displayName, user.photoUrl)),
    uid: user.uid,
    displayName: parsed.data.displayName ?? existing?.displayName ?? user.displayName,
    photoUrl:
      parsed.data.photoUrl !== undefined
        ? parsed.data.photoUrl
        : (existing?.photoUrl ?? user.photoUrl),
    cityId:
      parsed.data.cityId !== undefined ? parsed.data.cityId : (existing?.cityId ?? user.cityId),
    cityName:
      parsed.data.cityName !== undefined
        ? parsed.data.cityName
        : (existing?.cityName ?? user.cityName),
    division:
      parsed.data.division !== undefined
        ? parsed.data.division
        : (existing?.division ?? (user.dateOfBirth ? divisionFromDob(user.dateOfBirth) : null)),
    updatedAt: now,
    createdAt: existing?.createdAt ?? now,
  };

  await updateStore((s) => {
    const has = s.playerProfiles.some((p) => p.uid === next.uid);
    return {
      ...s,
      playerProfiles: has
        ? s.playerProfiles.map((p) => (p.uid === next.uid ? next : p))
        : [...s.playerProfiles, next],
    };
  });

  await scheduleSync([
    {
      entity: 'profile',
      docId: next.uid,
      leagueId: null,
      action: 'upsert',
      payload: next,
      updatedAt: next.updatedAt,
    },
  ]);
  logger.info('profile.service', 'Profile upserted', { uid: next.uid });
  return next;
}

export async function setOwnDateOfBirth(iso: string): Promise<void> {
  const dateOfBirth = parseAndValidateDob(iso);
  const division = divisionFromDob(dateOfBirth);
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  await updateStore((s) => ({
    ...s,
    user: s.user ? { ...s.user, dateOfBirth } : s.user,
  }));
  await scheduleUserProfileSync();
  await upsertOwnProfile({ division });
  logger.info('profile.service', 'Date of birth saved', { uid: user.uid, division });
}

/**
 * One card per person in a city hub. Older app versions could create a second card for
 * the same account; prefer the stable-id card, then the one with the most games played.
 */
function hubCardsByUid(cityLeagueId: string): Map<string, Player> {
  const best = new Map<string, Player>();
  for (const p of getStore().players) {
    if (p.leagueId !== cityLeagueId || !p.authUid) {
      continue;
    }
    const current = best.get(p.authUid);
    const stableId = memberPlayerId(cityLeagueId, p.authUid);
    const better =
      !current ||
      (p.id === stableId && current.id !== stableId) ||
      (current.id !== stableId &&
        (p.stats.standard.played > current.stats.standard.played ||
          (p.stats.standard.played === current.stats.standard.played &&
            p.updatedAt > current.updatedAt)));
    if (better) {
      best.set(p.authUid, p);
    }
  }
  return best;
}

/** Show the signed-in person's city-hub numbers on their own profile (this phone only). */
export async function syncCityRankFromHub(uid: string, cityLeagueId: string): Promise<void> {
  await loadStore();
  if (getStore().user?.uid !== uid) {
    // Profiles are writable only by their owner; never write someone else's.
    return;
  }
  const player = hubCardsByUid(cityLeagueId).get(uid);
  const existing = profileFromStore(uid);
  if (!existing || !player) {
    return;
  }
  const std = player.stats.standard;
  const next: PlayerProfile = {
    ...existing,
    played: std.played,
    winPct: std.winPct,
    titles: std.titles,
    highestBreak: std.highestBreak,
    centuries: std.centuries,
    breaks50: std.breaks50,
    maximums: std.maximums,
    rankScore: rankScore(std.played, std.winPct),
    updatedAt: nowIso(),
  };
  // Shown on this phone right away; the server sets the trusted rank on the public profile
  // itself (backend/internal/stats), so nothing is uploaded here.
  await updateStore((s) => ({
    ...s,
    playerProfiles: s.playerProfiles.map((p) => (p.uid === uid ? next : p)),
  }));
}

function asProfile(data: Record<string, unknown>, uid: string): PlayerProfile {
  return {
    uid,
    displayName: String(data.displayName ?? ''),
    photoUrl: (data.photoUrl as string | null) ?? null,
    cityId: typeof data.cityId === 'string' ? data.cityId : null,
    cityName: typeof data.cityName === 'string' ? data.cityName : null,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? data.createdAt ?? ''),
    rankScore: Number(data.rankScore ?? 0),
    played: Number(data.played ?? 0),
    winPct: Number(data.winPct ?? 0),
    titles: Number(data.titles ?? 0),
    highestBreak: Number(data.highestBreak ?? 0),
    centuries: Number(data.centuries ?? 0),
    breaks50: Number(data.breaks50 ?? 0),
    maximums: Number(data.maximums ?? 0),
    division: isSnookerDivision(data.division) ? data.division : null,
  };
}

export async function listCityProfiles(input: {
  cityId: string;
  cursorRank?: number;
  cursorUid?: string;
}): Promise<{ items: PlayerProfile[]; nextCursor: { rankScore: number; uid: string } | null }> {
  await loadStore();
  const user = getStore().user;

  if (shouldCloudSync(user) && isOnline()) {
    try {
      // Same order as the board: rank score, then id, both descending.
      const page = await listCommunityDocs<Record<string, unknown>>('profile', {
        city: input.cityId,
        limit: CITY_PAGE,
        cursor:
          input.cursorRank != null && input.cursorUid
            ? `${input.cursorRank}|${input.cursorUid}`
            : undefined,
      });
      const items = page.items
        .filter((d) => typeof d.uid === 'string' && d.uid.length > 0 && !isBlocked(d.uid))
        .map((d) => asProfile(d, d.uid as string));
      const last = items[items.length - 1];
      await updateStore((s) => {
        // Never replace a profile (our own) while an edit of it is still uploading.
        const pending = pendingDocIdsOf(s.pendingOps);
        const map = new Map(s.playerProfiles.map((p) => [p.uid, p]));
        for (const item of items) {
          if (!pending.has(item.uid)) {
            map.set(item.uid, item);
          }
        }
        return { ...s, playerProfiles: [...map.values()] };
      });
      return {
        items,
        nextCursor: page.hasMore && last ? { rankScore: last.rankScore, uid: last.uid } : null,
      };
    } catch (error) {
      logger.error('profile.service', 'City profile query failed', apiErrorMeta(error));
    }
  }

  const local = getStore()
    .playerProfiles.filter((p) => p.cityId === input.cityId && !isBlocked(p.uid))
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) {
        return b.rankScore - a.rankScore;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  // Same order as the cloud query, so a page boundary never repeats a row.
  local.sort((a, b) => b.rankScore - a.rankScore || b.uid.localeCompare(a.uid));
  const cursorIndex =
    input.cursorUid != null ? local.findIndex((p) => p.uid === input.cursorUid) : -1;
  if (input.cursorUid != null && cursorIndex < 0) {
    // Cursor not found locally: there is no next page (never restart from the top).
    return { items: [], nextCursor: null };
  }
  const offset = cursorIndex + 1;
  const items = local.slice(Math.max(0, offset), Math.max(0, offset) + CITY_PAGE);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      offset + items.length < local.length && last
        ? { rankScore: last.rankScore, uid: last.uid }
        : null,
  };
}

export async function getPublicProfile(uid: string): Promise<PlayerProfile | null> {
  await loadStore();
  const local = profileFromStore(uid);
  if (local) {
    return local;
  }
  const user = getStore().user;
  if (!shouldCloudSync(user) || !isOnline()) {
    return null;
  }
  try {
    const data = await getCommunityDoc<Record<string, unknown>>('profile', uid);
    if (!data) {
      return null;
    }
    const profile = asProfile(data, uid);
    await updateStore((s) => {
      const has = s.playerProfiles.some((p) => p.uid === profile.uid);
      return {
        ...s,
        playerProfiles: has
          ? s.playerProfiles.map((p) => (p.uid === profile.uid ? profile : p))
          : [...s.playerProfiles, profile],
      };
    });
    return profile;
  } catch (error) {
    logger.error('profile.service', 'Point-read profile failed', apiErrorMeta(error));
    return null;
  }
}

export function bestInCity(profiles: PlayerProfile[]): PlayerProfile | null {
  const eligible = profiles.filter((p) => p.played >= MIN_GAMES_FOR_RANK);
  if (eligible.length === 0) {
    return null;
  }
  return [...eligible].sort((a, b) => b.rankScore - a.rankScore)[0] ?? null;
}

export function cityHubPlayersForRank(cityLeagueId: string): PlayerProfile[] {
  const league = getStore().leagues.find((l) => l.id === cityLeagueId);
  if (!league || leagueKindOf(league) !== 'city') {
    return [];
  }
  return [...hubCardsByUid(cityLeagueId).values()]
    .map((p) => {
      const std = p.stats.standard;
      return {
        uid: p.authUid!,
        displayName: p.displayName,
        photoUrl: p.photoUrl,
        cityId: league.cityId ?? null,
        cityName: null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        rankScore: rankScore(std.played, std.winPct),
        played: std.played,
        winPct: std.winPct,
        titles: std.titles,
        highestBreak: std.highestBreak,
        centuries: std.centuries,
        breaks50: std.breaks50,
        maximums: std.maximums,
        division: p.authUid ? (profileFromStore(p.authUid)?.division ?? null) : null,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
