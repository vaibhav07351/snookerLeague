import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, inviteCode, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { emptyRaceStats, emptyStandardStats, type League, type Player } from '@/shared/types/domain';

const createLeagueSchema = z.object({
  name: z.string().trim().min(2).max(40),
  uid: z.string().min(1),
  displayName: z.string().trim().min(1),
  photoUrl: z.string().nullable(),
  defaultRaceTarget: z.number().int().min(1).max(500).default(50),
  defaultBestOf: z.number().int().min(1).max(35).default(3),
});

const joinLeagueSchema = z.object({
  code: z.string().trim().min(4).max(8),
  uid: z.string().min(1),
  displayName: z.string().trim().min(1),
  photoUrl: z.string().nullable(),
});

function makeMemberPlayer(
  leagueId: string,
  uid: string,
  displayName: string,
  photoUrl: string | null,
): Player {
  return {
    id: createId('plr'),
    leagueId,
    displayName,
    kind: 'member',
    authUid: uid,
    photoUrl,
    createdAt: nowIso(),
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

export async function getActiveLeague(): Promise<League | null> {
  await loadStore();
  const { activeLeagueId, leagues } = getStore();
  if (!activeLeagueId) {
    return null;
  }
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}

export async function listLeaguesForUser(uid: string): Promise<League[]> {
  await loadStore();
  return getStore().leagues.filter((l) => l.memberUids.includes(uid));
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
    throw new AppError('VALIDATION', 'Invalid league details');
  }

  const league: League = {
    id: createId('lg'),
    name: parsed.data.name,
    inviteCode: inviteCode(),
    createdAt: nowIso(),
    createdByUid: parsed.data.uid,
    memberUids: [parsed.data.uid],
    defaultRaceTarget: parsed.data.defaultRaceTarget,
    defaultBestOf: parsed.data.defaultBestOf,
    reigningTeam: null,
    raceKing: null,
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

  logger.info('league.service', 'League created', { leagueId: league.id });
  return league;
}

export async function joinLeague(input: {
  code: string;
  uid: string;
  displayName: string;
  photoUrl: string | null;
}): Promise<League> {
  const parsed = joinLeagueSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid invite code');
  }

  await loadStore();
  const code = parsed.data.code.toUpperCase();
  const league = getStore().leagues.find((l) => l.inviteCode === code);
  if (!league) {
    throw new AppError('NOT_FOUND', 'No league found for that invite code');
  }

  const alreadyMember = league.memberUids.includes(parsed.data.uid);
  const existingPlayer = getStore().players.find(
    (p) => p.leagueId === league.id && p.authUid === parsed.data.uid,
  );

  await updateStore((s) => {
    const leagues = s.leagues.map((l) => {
      if (l.id !== league.id) {
        return l;
      }
      if (alreadyMember) {
        return l;
      }
      return { ...l, memberUids: [...l.memberUids, parsed.data.uid] };
    });
    const players =
      existingPlayer != null
        ? s.players
        : [
            ...s.players,
            makeMemberPlayer(
              league.id,
              parsed.data.uid,
              parsed.data.displayName,
              parsed.data.photoUrl,
            ),
          ];
    return { ...s, leagues, players, activeLeagueId: league.id };
  });

  logger.info('league.service', 'Joined league', { leagueId: league.id });
  return { ...league, memberUids: alreadyMember ? league.memberUids : [...league.memberUids, parsed.data.uid] };
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
  };
  await updateStore((s) => ({
    ...s,
    leagues: s.leagues.map((l) => (l.id === leagueId ? next : l)),
  }));
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
  if (league.createdByUid !== input.uid) {
    throw new AppError('FORBIDDEN', 'Only the person who created this league can delete it');
  }
  if (input.typedName.trim() !== league.name) {
    throw new AppError('VALIDATION', 'Typed name does not match the league name');
  }

  await updateStore((s) => {
    const leagues = s.leagues.filter((l) => l.id !== input.leagueId);
    const players = s.players.filter((p) => p.leagueId !== input.leagueId);
    const matches = s.matches.filter((m) => m.leagueId !== input.leagueId);
    const races = s.races.filter((r) => r.leagueId !== input.leagueId);
    const events = s.events.filter((e) => e.leagueId !== input.leagueId);

    let activeLeagueId = s.activeLeagueId;
    if (activeLeagueId === input.leagueId) {
      const next = leagues.find((l) => l.memberUids.includes(input.uid));
      activeLeagueId = next?.id ?? null;
    }

    return {
      ...s,
      leagues,
      players,
      matches,
      races,
      events,
      activeLeagueId,
    };
  });

  logger.info('league.service', 'League deleted', { leagueId: input.leagueId });
  return { nextActiveLeagueId: getStore().activeLeagueId };
}
