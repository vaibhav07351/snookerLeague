import { z } from 'zod';

import { makeMemberPlayer } from '@/features/players/services/players.service';
import { ApiError, apiErrorMeta } from '@/shared/api/client';
import { loadTokens } from '@/shared/api/tokens';
import { joinLeagueByCode } from '@/shared/api/sync-api';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, inviteCode, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { replaceWithServerDoc } from '@/shared/sync/apply';
import { fetchLeagueInvite, pullLeague } from '@/shared/sync/pull';
import { isOnline } from '@/shared/sync/connectivity';
import {
  onActiveLeagueChanged,
  scheduleSync,
  scheduleUserProfileSync,
  shouldCloudSync,
  type ScheduleItem,
} from '@/shared/sync';
import { leagueKindOf, type League, type LeagueInvite } from '@/shared/types/domain';

const createLeagueSchema = z.object({
  name: z.string().trim().min(2).max(40),
  uid: z.string().min(1),
  displayName: z.string().trim().min(1),
  photoUrl: z.string().nullable(),
  defaultRaceTarget: z.number().int().min(1).max(500).default(50),
  defaultBestOf: z.number().int().min(1).max(35).default(3),
});

const inviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/);

export function normalizeInviteCode(raw: string): string {
  const parsed = inviteCodeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      'That invite code does not look right. Codes are 4 to 8 letters and numbers.',
    );
  }
  return parsed.data;
}

function leagueSyncItem(league: League, fieldsOnly?: string[]): ScheduleItem {
  return {
    ...(fieldsOnly ? { fieldsOnly } : {}),
    entity: 'league',
    docId: league.id,
    leagueId: null,
    action: 'upsert',
    payload: league,
    updatedAt: league.updatedAt,
  };
}

/** The user's first club league (never the city hub), for falling back to. */
export function firstClubLeagueId(
  leagues: League[],
  uid: string | null | undefined,
): string | null {
  return (
    leagues.find((l) => uid != null && l.memberUids.includes(uid) && leagueKindOf(l) !== 'city')
      ?.id ?? null
  );
}

/**
 * The league the app shows: the stored active league, or the first club league when the
 * active one is a city hub. Synchronous, so the session can use it on every store change.
 */
export function resolveActiveLeague(store: {
  activeLeagueId: string | null;
  leagues: League[];
  user: { uid: string } | null;
}): League | null {
  if (!store.activeLeagueId) {
    return null;
  }
  const active = store.leagues.find((l) => l.id === store.activeLeagueId) ?? null;
  if (active && leagueKindOf(active) === 'city') {
    const id = firstClubLeagueId(store.leagues, store.user?.uid);
    return store.leagues.find((l) => l.id === id) ?? null;
  }
  return active;
}

/** Point read of one league from the local store. */
export async function getLeague(leagueId: string): Promise<League | null> {
  await loadStore();
  return getStore().leagues.find((l) => l.id === leagueId) ?? null;
}

export async function getActiveLeague(): Promise<League | null> {
  await loadStore();
  return resolveActiveLeague(getStore());
}

export async function listLeaguesForUser(uid: string): Promise<League[]> {
  await loadStore();
  return getStore().leagues.filter((l) => l.memberUids.includes(uid) && leagueKindOf(l) !== 'city');
}

export async function createLeague(input: {
  name: string;
  uid: string;
  displayName: string;
  photoUrl: string | null;
  defaultRaceTarget?: number;
  defaultBestOf?: number;
}): Promise<League> {
  const parsed = createLeagueSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'League names are 2 to 40 characters');
  }

  const now = nowIso();
  const league: League = {
    id: createId('lg'),
    name: parsed.data.name,
    inviteCode: inviteCode(),
    createdAt: now,
    updatedAt: now,
    createdByUid: parsed.data.uid,
    memberUids: [parsed.data.uid],
    defaultRaceTarget: parsed.data.defaultRaceTarget,
    defaultBestOf: parsed.data.defaultBestOf,
    reigningTeam: null,
    raceKing: null,
    kind: 'club',
    cityId: null,
  };

  const player = makeMemberPlayer(
    league.id,
    parsed.data.uid,
    parsed.data.displayName,
    parsed.data.photoUrl,
  );

  await updateStore((s) => ({
    ...s,
    leagues: [...s.leagues, league],
    players: [...s.players, player],
    activeLeagueId: league.id,
  }));

  await scheduleSync([
    leagueSyncItem(league),
    {
      entity: 'player',
      docId: player.id,
      leagueId: league.id,
      action: 'upsert',
      payload: player,
      updatedAt: player.updatedAt,
    },
  ]);
  await scheduleUserProfileSync();
  await onActiveLeagueChanged(league.id);

  logger.info('league.service', 'League created', { leagueId: league.id });
  return league;
}

export type InvitePreview =
  | { status: 'member'; league: League; hasPlayer: boolean }
  | { status: 'joinable'; leagueId: string; leagueName: string; local: boolean };

function hasOwnPlayer(leagueId: string, uid: string): boolean {
  return getStore().players.some((p) => p.leagueId === leagueId && p.authUid === uid);
}

/**
 * Look up an invite before joining, so the join screen can name the league and tell an
 * existing member they are already in. Never writes.
 */
export async function previewInvite(rawCode: string, uid: string): Promise<InvitePreview> {
  const code = normalizeInviteCode(rawCode);
  // On a cold start (every link open on web) the saved session loads a moment after the
  // app; without this a Google user would be told to sign in.
  await loadTokens();
  await loadStore();
  const store = getStore();
  const local = store.leagues.find((l) => l.inviteCode === code);
  if (local && local.memberUids.includes(uid)) {
    return { status: 'member', league: local, hasPlayer: hasOwnPlayer(local.id, uid) };
  }
  const cloud = shouldCloudSync(store.user);
  if (local && !cloud) {
    return { status: 'joinable', leagueId: local.id, leagueName: local.name, local: true };
  }
  if (!cloud) {
    throw new AppError(
      'NEEDS_ACCOUNT',
      "Sign in with Google to join a friend's league. Demo mode keeps everything on this phone only.",
    );
  }
  if (!isOnline()) {
    throw new AppError('OFFLINE', 'You are offline. Connect to the internet to join a league.');
  }

  let invite: LeagueInvite | null;
  try {
    invite = await fetchLeagueInvite(code);
  } catch (error) {
    logger.error('league.service', 'Invite lookup failed', apiErrorMeta(error));
    throw new AppError('NETWORK', 'Could not check the invite. Try again in a moment.');
  }
  if (!invite) {
    throw new AppError(
      'NOT_FOUND',
      'This invite is not valid any more. Ask your friend to share a fresh link.',
    );
  }
  const known = store.leagues.find((l) => l.id === invite.leagueId);
  if (known && known.memberUids.includes(uid)) {
    return { status: 'member', league: known, hasPlayer: hasOwnPlayer(known.id, uid) };
  }
  return {
    status: 'joinable',
    leagueId: invite.leagueId,
    leagueName: invite.leagueName,
    local: false,
  };
}

/**
 * Join a league with its invite code and make it the active league. Joining adds
 * membership only; picking "which player are you" is a separate step (players.service),
 * so nobody ends up with an extra card. Safe to repeat: already a member just opens it.
 */
export async function joinLeague(input: { code: string; uid: string }): Promise<League> {
  const preview = await previewInvite(input.code, input.uid);
  if (preview.status === 'member') {
    return setActiveLeague(preview.league.id, input.uid);
  }
  const code = normalizeInviteCode(input.code);
  const now = nowIso();

  if (preview.local) {
    // A local-only (demo) league on this same phone.
    const league = getStore().leagues.find((l) => l.id === preview.leagueId);
    if (!league) {
      throw new AppError('NOT_FOUND', 'League not found');
    }
    const joined: League = {
      ...league,
      memberUids: [...league.memberUids, input.uid],
      updatedAt: now,
    };
    await updateStore((s) => ({
      ...s,
      leagues: s.leagues.map((l) => (l.id === joined.id ? joined : l)),
      activeLeagueId: joined.id,
    }));
    logger.info('league.service', 'Joined local league', { leagueId: joined.id });
    return joined;
  }

  try {
    await replaceWithServerDoc(await joinLeagueByCode(code));
  } catch (error) {
    logger.error('league.service', 'Join failed', {
      leagueId: preview.leagueId,
      ...apiErrorMeta(error),
    });
    if (error instanceof ApiError && error.code === 'invite_not_found') {
      throw new AppError(
        'INVITE_INVALID',
        'The league owner changed this invite code. Ask for a fresh link.',
      );
    }
    throw new AppError('NETWORK', 'Could not join right now. Check your connection and try again.');
  }

  // The league's history is older than this phone's sync cursor, so fetch it in full.
  try {
    await pullLeague(preview.leagueId);
  } catch (error) {
    logger.warn('league.service', 'League history did not load yet', apiErrorMeta(error));
  }
  const league = getStore().leagues.find((l) => l.id === preview.leagueId);
  if (!league) {
    throw new AppError('NETWORK', 'You joined, but the league did not load yet. Try again.');
  }
  await updateStore((s) => ({ ...s, activeLeagueId: league.id }));
  await scheduleUserProfileSync();
  await onActiveLeagueChanged(league.id);
  logger.info('league.service', 'Joined league', { leagueId: league.id });
  return league;
}

/** Owner only: issue a new invite code. Old links and codes stop working. */
export async function regenerateInviteCode(leagueId: string, uid: string): Promise<League> {
  await loadStore();
  const league = getStore().leagues.find((l) => l.id === leagueId);
  if (!league) {
    throw new AppError('NOT_FOUND', 'League not found');
  }
  if (league.createdByUid !== uid) {
    throw new AppError('FORBIDDEN', 'Only the league owner can change the invite code');
  }
  const next: League = { ...league, inviteCode: inviteCode(), updatedAt: nowIso() };
  await updateStore((s) => ({
    ...s,
    leagues: s.leagues.map((l) => (l.id === leagueId ? next : l)),
  }));
  await scheduleSync([leagueSyncItem(next, ['inviteCode', 'updatedAt'])]);
  logger.info('league.service', 'Invite code regenerated', { leagueId });
  return next;
}

export async function setActiveLeague(leagueId: string, uid: string): Promise<League> {
  await loadStore();
  const league = getStore().leagues.find((l) => l.id === leagueId);
  if (!league) {
    throw new AppError('NOT_FOUND', 'League not found');
  }
  if (!league.memberUids.includes(uid)) {
    throw new AppError('FORBIDDEN', 'You are not a member of that league');
  }
  await updateStore((s) => ({ ...s, activeLeagueId: leagueId }));
  await onActiveLeagueChanged(leagueId);
  logger.info('league.service', 'Active league switched', { leagueId });
  return league;
}

export async function updateLeagueDefaults(
  leagueId: string,
  defaults: { defaultRaceTarget?: number; defaultBestOf?: number; name?: string },
): Promise<League> {
  await loadStore();
  const league = getStore().leagues.find((l) => l.id === leagueId);
  if (!league) {
    throw new AppError('NOT_FOUND', 'League not found');
  }
  const next: League = {
    ...league,
    defaultRaceTarget: defaults.defaultRaceTarget ?? league.defaultRaceTarget,
    defaultBestOf: defaults.defaultBestOf ?? league.defaultBestOf,
    name: defaults.name?.trim() || league.name,
    updatedAt: nowIso(),
  };
  await updateStore((s) => ({
    ...s,
    leagues: s.leagues.map((l) => (l.id === leagueId ? next : l)),
  }));
  await scheduleSync([
    leagueSyncItem(next, ['name', 'defaultRaceTarget', 'defaultBestOf', 'updatedAt']),
  ]);
  return next;
}

/**
 * Permanently delete a league and all its data.
 * Only the creator may delete. Caller must pass the exact league name.
 */
export async function deleteLeague(input: {
  leagueId: string;
  uid: string;
  typedName: string;
}): Promise<{ nextActiveLeagueId: string | null }> {
  await loadStore();
  const league = getStore().leagues.find((l) => l.id === input.leagueId);
  if (!league) {
    throw new AppError('NOT_FOUND', 'League not found');
  }
  if (leagueKindOf(league) === 'city') {
    throw new AppError('FORBIDDEN', 'City hubs cannot be deleted from here');
  }
  if (league.createdByUid !== input.uid) {
    throw new AppError('FORBIDDEN', 'Only the person who created this league can delete it');
  }
  if (input.typedName.trim() !== league.name) {
    throw new AppError('VALIDATION', 'Typed name does not match the league name');
  }

  const store = getStore();
  const inLeague = <T extends { leagueId: string; id: string }>(rows: T[]): string[] =>
    rows.filter((r) => r.leagueId === input.leagueId).map((r) => r.id);
  const playerIds = inLeague(store.players);
  const matchIds = inLeague(store.matches);
  const raceIds = inLeague(store.races);
  const eventIds = inLeague(store.events);
  const tournamentIds = inLeague(store.tournaments);

  await updateStore((s) => {
    const leagues = s.leagues.filter((l) => l.id !== input.leagueId);
    let activeLeagueId = s.activeLeagueId;
    if (activeLeagueId === input.leagueId) {
      activeLeagueId = firstClubLeagueId(leagues, input.uid);
    }
    return {
      ...s,
      leagues,
      players: s.players.filter((p) => p.leagueId !== input.leagueId),
      matches: s.matches.filter((m) => m.leagueId !== input.leagueId),
      races: s.races.filter((r) => r.leagueId !== input.leagueId),
      events: s.events.filter((e) => e.leagueId !== input.leagueId),
      tournaments: s.tournaments.filter((t) => t.leagueId !== input.leagueId),
      activeLeagueId,
    };
  });

  const now = nowIso();
  const deletes = (
    entity: 'player' | 'match' | 'race' | 'event' | 'tournament',
    ids: string[],
  ): ScheduleItem[] =>
    ids.map((docId) => ({
      entity,
      docId,
      leagueId: input.leagueId,
      action: 'delete' as const,
      payload: null,
      updatedAt: now,
    }));
  await scheduleSync([
    ...deletes('player', playerIds),
    ...deletes('match', matchIds),
    ...deletes('race', raceIds),
    ...deletes('event', eventIds),
    ...deletes('tournament', tournamentIds),
    {
      entity: 'league',
      docId: input.leagueId,
      leagueId: null,
      action: 'delete',
      payload: null,
      updatedAt: now,
    },
  ]);
  await scheduleUserProfileSync();
  await onActiveLeagueChanged(getStore().activeLeagueId);

  logger.info('league.service', 'League deleted', { leagueId: input.leagueId });
  return { nextActiveLeagueId: getStore().activeLeagueId };
}
