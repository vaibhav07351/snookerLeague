import { z } from 'zod';
import { getDocs, query, where, collection, orderBy, limit } from 'firebase/firestore';

import * as cityHubService from '@/features/league/services/city-hub.service';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import { isOnline } from '@/shared/sync/connectivity';
import { requireFirestore, shouldCloudSync } from '@/shared/sync/firestore-paths';
import type { Challenge, ChallengeStatus, Match } from '@/shared/types/domain';

const createSchema = z.object({
  toUid: z.string().min(1),
  cityId: z.string().min(1),
  bestOf: z.number().int().min(1).max(35),
});

function asChallenge(data: Record<string, unknown>, id: string): Challenge {
  return {
    id,
    fromUid: String(data.fromUid ?? ''),
    toUid: String(data.toUid ?? ''),
    cityId: String(data.cityId ?? ''),
    format: data.format === 'doubles' ? 'doubles' : 'singles',
    bestOf: Number(data.bestOf ?? 5),
    status: data.status as ChallengeStatus,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function createChallenge(input: {
  toUid: string;
  cityId: string;
  bestOf?: number;
}): Promise<Challenge> {
  const parsed = createSchema.safeParse({
    toUid: input.toUid,
    cityId: input.cityId,
    bestOf: input.bestOf ?? 5,
  });
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid challenge');
  }
  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }
  if (user.uid === parsed.data.toUid) {
    throw new AppError('VALIDATION', 'You cannot challenge yourself');
  }
  const existing = getStore().challenges.find(
    (c) =>
      c.status === 'pending' &&
      ((c.fromUid === user.uid && c.toUid === parsed.data.toUid) ||
        (c.fromUid === parsed.data.toUid && c.toUid === user.uid)),
  );
  if (existing) {
    throw new AppError('INVALID_STATE', 'A challenge is already pending with this player');
  }

  const now = nowIso();
  const challenge: Challenge = {
    id: createId('ch'),
    fromUid: user.uid,
    toUid: parsed.data.toUid,
    cityId: parsed.data.cityId,
    format: 'singles',
    bestOf: parsed.data.bestOf,
    status: 'pending',
    matchId: null,
    createdAt: now,
    updatedAt: now,
  };
  await updateStore((s) => ({ ...s, challenges: [...s.challenges, challenge] }));
  await scheduleSync([
    {
      entity: 'challenge',
      docId: challenge.id,
      leagueId: null,
      action: 'upsert',
      payload: challenge,
      updatedAt: challenge.updatedAt,
    },
  ]);
  logger.info('challenge.service', 'Challenge created', { challengeId: challenge.id });
  return challenge;
}

export async function setChallengeStatus(
  challengeId: string,
  status: Extract<ChallengeStatus, 'declined' | 'cancelled'>,
): Promise<Challenge> {
  await loadStore();
  const user = getStore().user;
  const challenge = getStore().challenges.find((c) => c.id === challengeId);
  if (!user || !challenge) {
    throw new AppError('NOT_FOUND', 'Challenge not found');
  }
  if (challenge.status !== 'pending') {
    throw new AppError('INVALID_STATE', 'Challenge is no longer pending');
  }
  if (status === 'cancelled' && challenge.fromUid !== user.uid) {
    throw new AppError('FORBIDDEN', 'Only the sender can cancel');
  }
  if (status === 'declined' && challenge.toUid !== user.uid) {
    throw new AppError('FORBIDDEN', 'Only the recipient can decline');
  }
  const next: Challenge = { ...challenge, status, updatedAt: nowIso() };
  await persistChallenge(next);
  return next;
}

export async function acceptChallenge(
  challengeId: string,
): Promise<{ challenge: Challenge; match: Match }> {
  await loadStore();
  const user = getStore().user;
  const challenge = getStore().challenges.find((c) => c.id === challengeId);
  if (!user || !challenge) {
    throw new AppError('NOT_FOUND', 'Challenge not found');
  }
  if (challenge.toUid !== user.uid) {
    throw new AppError('FORBIDDEN', 'Only the recipient can accept');
  }
  if (challenge.status !== 'pending') {
    throw new AppError('INVALID_STATE', 'Challenge is no longer pending');
  }

  const hub = await cityHubService.ensureCityHub({
    cityId: challenge.cityId,
    cityName: user.cityName ?? challenge.cityId,
    uid: user.uid,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    leaveCityId: null,
  });
  const fromHub = await cityHubService.ensureCityHub({
    cityId: challenge.cityId,
    cityName: user.cityName ?? challenge.cityId,
    uid: challenge.fromUid,
    displayName:
      getStore().playerProfiles.find((p) => p.uid === challenge.fromUid)?.displayName ?? 'Player',
    photoUrl: getStore().playerProfiles.find((p) => p.uid === challenge.fromUid)?.photoUrl ?? null,
    leaveCityId: null,
  });
  const cityLeague = hub.id === fromHub.id ? hub : fromHub;
  const roster = await playersService.listPlayers(cityLeague.id);
  const me = roster.find((p) => p.authUid === user.uid);
  const them = roster.find((p) => p.authUid === challenge.fromUid);
  if (!me || !them) {
    throw new AppError('INVALID_STATE', 'Both players must be in the city hub');
  }

  const match = await matchService.createMatch({
    leagueId: cityLeague.id,
    createdByUid: user.uid,
    format: 'singles',
    teamA: [them.id],
    teamB: [me.id],
    bestOf: challenge.bestOf,
    namedLabel: 'City challenge',
    crownsChampion: false,
  });

  const next: Challenge = {
    ...challenge,
    status: 'accepted',
    matchId: match.id,
    updatedAt: nowIso(),
  };
  await persistChallenge(next);
  logger.info('challenge.service', 'Challenge accepted', { challengeId, matchId: match.id });
  return { challenge: next, match };
}

async function persistChallenge(next: Challenge): Promise<void> {
  await updateStore((s) => ({
    ...s,
    challenges: s.challenges.map((c) => (c.id === next.id ? next : c)),
  }));
  await scheduleSync([
    {
      entity: 'challenge',
      docId: next.id,
      leagueId: null,
      action: 'upsert',
      payload: next,
      updatedAt: next.updatedAt,
    },
  ]);
}

export async function listMyChallenges(): Promise<Challenge[]> {
  await loadStore();
  const user = getStore().user;
  if (!user) {
    return [];
  }
  if (shouldCloudSync(user) && isOnline()) {
    try {
      const col = collection(requireFirestore(), 'challenges');
      const [inbox, outbox] = await Promise.all([
        getDocs(
          query(col, where('toUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)),
        ),
        getDocs(
          query(col, where('fromUid', '==', user.uid), orderBy('createdAt', 'desc'), limit(20)),
        ),
      ]);
      const remote = [...inbox.docs, ...outbox.docs].map((d) => asChallenge(d.data(), d.id));
      await updateStore((s) => {
        const map = new Map(s.challenges.map((c) => [c.id, c]));
        for (const row of remote) {
          map.set(row.id, row);
        }
        return { ...s, challenges: [...map.values()] };
      });
    } catch (error) {
      logger.error('challenge.service', 'Challenge query failed', {
        shape: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  return getStore()
    .challenges.filter((c) => c.fromUid === user.uid || c.toUid === user.uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);
}
