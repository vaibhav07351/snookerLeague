import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, inviteCode, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import {
  applyLeagueBundleToLocal,
  fetchLeagueBundle,
  findLeagueByInviteCode,
} from '@/shared/sync/pull';
import { isOnline } from '@/shared/sync/connectivity';
import {
  onActiveLeagueChanged,
  scheduleSync,
  scheduleUserProfileSync,
  shouldCloudSync,
} from '@/shared/sync';
import { uniqueDisplayName } from '@/features/players/services/players.service';
import {
  emptyRaceStats,
  emptyStandardStats,
  leagueKindOf,
  type League,
  type Player,
} from '@/shared/types/domain';

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
  const now = nowIso();
  return {
    id: createId('plr'),
    leagueId,
    displayName,
    kind: 'member',
    authUid: uid,
    photoUrl,
    createdAt: now,
    updatedAt: now,
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };
}

export async function getActiveLeague(): Promise<League | null> {
  await loadStore();
  const { activeLeagueId, leagues, user } = getStore();
  if (!activeLeagueId) {
    return null;
  }
  const active = leagues.find((l) => l.id === activeLeagueId) ?? null;
  if (active && leagueKindOf(active) === 'city') {
    const uid = user?.uid;
    return (
      leagues.find(
        (l) => uid != null && l.memberUids.includes(uid) && leagueKindOf(l) !== 'city',
      ) ?? null
    );
  }
  return active;
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
    throw new AppError('VALIDATION', 'Invalid league details');
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
    {
      entity: 'league',
      docId: league.id,
      leagueId: null,
      action: 'upsert',
      payload: league,
      updatedAt: league.updatedAt,
    },
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
  let league = getStore().leagues.find((l) => l.inviteCode === code) ?? null;

  // Cloud users can join leagues that exist only remotely.
  if (!league && shouldCloudSync(getStore().user) && isOnline()) {
    try {
      const remote = await findLeagueByInviteCode(code);
      if (remote) {
        const bundle = await fetchLeagueBundle(remote.id);
        await applyLeagueBundleToLocal(bundle);
        league = getStore().leagues.find((l) => l.id === remote.id) ?? remote;
      }
    } catch (error) {
      logger.error('league.service', 'Remote invite lookup failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  if (!league) {
    throw new AppError('NOT_FOUND', 'No league found for that invite code');
  }

  const alreadyMember = league.memberUids.includes(parsed.data.uid);
  const existingPlayer = getStore().players.find(
    (p) => p.leagueId === league!.id && p.authUid === parsed.data.uid,
  );

  const now = nowIso();
  const newPlayer =
    existingPlayer != null
      ? null
      : makeMemberPlayer(
          league.id,
          parsed.data.uid,
          uniqueDisplayName(league.id, parsed.data.displayName),
          parsed.data.photoUrl,
        );

  const updatedLeague: League = alreadyMember
    ? { ...league, updatedAt: now }
    : {
        ...league,
        memberUids: [...league.memberUids, parsed.data.uid],
        updatedAt: now,
      };

  await updateStore((s) => {
    const leagues = s.leagues.map((l) => (l.id === updatedLeague.id ? updatedLeague : l));
    const players = newPlayer ? [...s.players, newPlayer] : s.players;
    return { ...s, leagues, players, activeLeagueId: updatedLeague.id };
  });

  await scheduleSync([
    {
      entity: 'league',
      docId: updatedLeague.id,
      leagueId: null,
      action: 'upsert',
      payload: updatedLeague,
      updatedAt: updatedLeague.updatedAt,
    },
    ...(newPlayer
      ? [
          {
            entity: 'player' as const,
            docId: newPlayer.id,
            leagueId: updatedLeague.id,
            action: 'upsert' as const,
            payload: newPlayer,
            updatedAt: newPlayer.updatedAt,
          },
        ]
      : []),
  ]);
  await scheduleUserProfileSync();
  await onActiveLeagueChanged(updatedLeague.id);

  logger.info('league.service', 'Joined league', { leagueId: updatedLeague.id });
  return updatedLeague;
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
    {
      entity: 'league',
      docId: next.id,
      leagueId: null,
      action: 'upsert',
      payload: next,
      updatedAt: next.updatedAt,
    },
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
  const playerIds = store.players.filter((p) => p.leagueId === input.leagueId).map((p) => p.id);
  const matchIds = store.matches.filter((m) => m.leagueId === input.leagueId).map((m) => m.id);
  const raceIds = store.races.filter((r) => r.leagueId === input.leagueId).map((r) => r.id);
  const eventIds = store.events.filter((e) => e.leagueId === input.leagueId).map((e) => e.id);

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

  const now = nowIso();
  await scheduleSync([
    ...playerIds.map((docId) => ({
      entity: 'player' as const,
      docId,
      leagueId: input.leagueId,
      action: 'delete' as const,
      payload: null,
      updatedAt: now,
    })),
    ...matchIds.map((docId) => ({
      entity: 'match' as const,
      docId,
      leagueId: input.leagueId,
      action: 'delete' as const,
      payload: null,
      updatedAt: now,
    })),
    ...raceIds.map((docId) => ({
      entity: 'race' as const,
      docId,
      leagueId: input.leagueId,
      action: 'delete' as const,
      payload: null,
      updatedAt: now,
    })),
    ...eventIds.map((docId) => ({
      entity: 'event' as const,
      docId,
      leagueId: input.leagueId,
      action: 'delete' as const,
      payload: null,
      updatedAt: now,
    })),
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
