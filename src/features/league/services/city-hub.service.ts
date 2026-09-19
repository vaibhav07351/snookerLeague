import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, inviteCode, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { applyLeagueBundleToLocal, fetchLeagueBundle } from '@/shared/sync/pull';
import { isOnline } from '@/shared/sync/connectivity';
import { scheduleSync, shouldCloudSync } from '@/shared/sync';
import { uniqueDisplayName } from '@/features/players/services/players.service';
import {
  cityHubId,
  emptyRaceStats,
  emptyStandardStats,
  leagueKindOf,
  type League,
  type Player,
} from '@/shared/types/domain';

const ensureSchema = z.object({
  cityId: z.string().min(2).max(48),
  cityName: z.string().min(1).max(60),
  uid: z.string().min(1),
  displayName: z.string().min(1),
  photoUrl: z.string().nullable(),
  leaveCityId: z.string().nullable(),
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

export function getLocalCityHub(cityId: string): League | null {
  const id = cityHubId(cityId);
  return getStore().leagues.find((l) => l.id === id) ?? null;
}

async function leaveCityHub(cityId: string, uid: string): Promise<void> {
  const id = cityHubId(cityId);
  await loadStore();
  const league = getStore().leagues.find((l) => l.id === id);
  if (!league || !league.memberUids.includes(uid)) {
    return;
  }
  const now = nowIso();
  const updated: League = {
    ...league,
    memberUids: league.memberUids.filter((m) => m !== uid),
    updatedAt: now,
  };
  await updateStore((s) => ({
    ...s,
    leagues: s.leagues.map((l) => (l.id === id ? updated : l)),
  }));
  await scheduleSync([
    {
      entity: 'league',
      docId: updated.id,
      leagueId: null,
      action: 'upsert',
      payload: updated,
      updatedAt: updated.updatedAt,
    },
  ]);
}

export async function ensureCityHub(input: {
  cityId: string;
  cityName: string;
  uid: string;
  displayName: string;
  photoUrl: string | null;
  leaveCityId: string | null;
}): Promise<League> {
  const parsed = ensureSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid city hub details');
  }

  if (parsed.data.leaveCityId) {
    await leaveCityHub(parsed.data.leaveCityId, parsed.data.uid);
  }

  const hubId = cityHubId(parsed.data.cityId);
  await loadStore();
  let league = getStore().leagues.find((l) => l.id === hubId) ?? null;

  if (!league && shouldCloudSync(getStore().user) && isOnline()) {
    try {
      const bundle = await fetchLeagueBundle(hubId);
      if (bundle.league) {
        await applyLeagueBundleToLocal(bundle);
        league = getStore().leagues.find((l) => l.id === hubId) ?? bundle.league;
      }
    } catch (error) {
      logger.error('city-hub.service', 'Remote city hub lookup failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  const now = nowIso();
  if (!league) {
    league = {
      id: hubId,
      name: `${parsed.data.cityName} · Snookit`,
      inviteCode: `C${inviteCode().slice(0, 5)}`,
      createdAt: now,
      updatedAt: now,
      createdByUid: parsed.data.uid,
      memberUids: [parsed.data.uid],
      defaultRaceTarget: 50,
      defaultBestOf: 5,
      reigningTeam: null,
      raceKing: null,
      kind: 'city',
      cityId: parsed.data.cityId,
    };
  } else if (!league.memberUids.includes(parsed.data.uid)) {
    league = {
      ...league,
      kind: 'city',
      cityId: parsed.data.cityId,
      memberUids: [...league.memberUids, parsed.data.uid],
      updatedAt: now,
    };
  } else {
    league = { ...league, kind: 'city', cityId: parsed.data.cityId, updatedAt: now };
  }

  const existingPlayer = getStore().players.find(
    (p) => p.leagueId === hubId && p.authUid === parsed.data.uid,
  );
  const newPlayer =
    existingPlayer != null
      ? null
      : makeMemberPlayer(
          hubId,
          parsed.data.uid,
          uniqueDisplayName(hubId, parsed.data.displayName),
          parsed.data.photoUrl,
        );

  await updateStore((s) => {
    const has = s.leagues.some((l) => l.id === hubId);
    const leagues = has
      ? s.leagues.map((l) => (l.id === hubId ? league! : l))
      : [...s.leagues, league!];
    const players = newPlayer ? [...s.players, newPlayer] : s.players;
    return { ...s, leagues, players };
  });

  await scheduleSync([
    {
      entity: 'league',
      docId: league.id,
      leagueId: null,
      action: 'upsert',
      payload: league,
      updatedAt: league.updatedAt,
    },
    ...(newPlayer
      ? [
          {
            entity: 'player' as const,
            docId: newPlayer.id,
            leagueId: hubId,
            action: 'upsert' as const,
            payload: newPlayer,
            updatedAt: newPlayer.updatedAt,
          },
        ]
      : []),
  ]);

  logger.info('city-hub.service', 'City hub ready', { hubId });
  return league;
}

export async function getCityHubForUser(uid: string): Promise<League | null> {
  await loadStore();
  const user = getStore().user;
  if (!user?.cityId || user.uid !== uid) {
    return (
      getStore().leagues.find((l) => leagueKindOf(l) === 'city' && l.memberUids.includes(uid)) ??
      null
    );
  }
  return getStore().leagues.find((l) => l.id === cityHubId(user.cityId as string)) ?? null;
}
