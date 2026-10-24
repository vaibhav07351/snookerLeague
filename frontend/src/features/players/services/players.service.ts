import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import { emptyRaceStats, emptyStandardStats, type Player } from '@/shared/types/domain';

const guestSchema = z.object({
  leagueId: z.string().min(1),
  displayName: z.string().trim().min(2).max(40),
});

export async function listPlayers(leagueId: string): Promise<Player[]> {
  await loadStore();
  return getStore()
    .players.filter((p) => p.leagueId === leagueId)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getPlayer(playerId: string): Promise<Player | null> {
  await loadStore();
  return getStore().players.find((p) => p.id === playerId) ?? null;
}

export async function getPlayerByAuthUid(
  leagueId: string,
  authUid: string,
): Promise<Player | null> {
  await loadStore();
  return getStore().players.find((p) => p.leagueId === leagueId && p.authUid === authUid) ?? null;
}

export async function addGuestPlayer(input: {
  leagueId: string;
  displayName: string;
}): Promise<Player> {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Guest name must be at least 2 characters');
  }
  await loadStore();
  requireUniqueDisplayName(parsed.data.leagueId, parsed.data.displayName);

  const now = nowIso();
  const player: Player = {
    id: createId('plr'),
    leagueId: parsed.data.leagueId,
    displayName: parsed.data.displayName,
    kind: 'guest',
    authUid: null,
    photoUrl: null,
    createdAt: now,
    updatedAt: now,
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };

  await updateStore((s) => ({ ...s, players: [...s.players, player] }));
  await scheduleSync([
    {
      entity: 'player',
      docId: player.id,
      leagueId: player.leagueId,
      action: 'upsert',
      payload: player,
      updatedAt: player.updatedAt,
    },
  ]);
  logger.info('players.service', 'Guest added', { playerId: player.id, leagueId: player.leagueId });
  return player;
}

/**
 * Deterministic id for a person's own player card in a league. The same person joining
 * twice (retry, second phone, reinstall) always maps to the same document, so it can never
 * create a duplicate card.
 */
export function memberPlayerId(leagueId: string, uid: string): string {
  return `pm_${leagueId}_${uid}`;
}

export function makeMemberPlayer(
  leagueId: string,
  uid: string,
  displayName: string,
  photoUrl: string | null,
): Player {
  const now = nowIso();
  return {
    id: memberPlayerId(leagueId, uid),
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

/** Guest cards nobody has claimed yet: the "is one of these you?" list when joining. */
export async function listClaimablePlayers(leagueId: string): Promise<Player[]> {
  await loadStore();
  return getStore()
    .players.filter((p) => p.leagueId === leagueId && p.authUid == null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function requireNoCardYet(leagueId: string, uid: string): void {
  const existing = getStore().players.find((p) => p.leagueId === leagueId && p.authUid === uid);
  if (existing) {
    throw new AppError('CONFLICT', `You already play as ${existing.displayName} in this league`);
  }
}

async function savePlayer(player: Player): Promise<void> {
  await updateStore((s) => ({
    ...s,
    players: s.players.some((p) => p.id === player.id)
      ? s.players.map((p) => (p.id === player.id ? player : p))
      : [...s.players, player],
  }));
  await scheduleSync([
    {
      entity: 'player',
      docId: player.id,
      leagueId: player.leagueId,
      action: 'upsert',
      payload: player,
      updatedAt: player.updatedAt,
    },
  ]);
}

/**
 * "That's me": link an existing guest card (and its match history) to this account.
 * Firestore rules allow this only while the card has no owner.
 */
export async function claimPlayer(input: {
  playerId: string;
  uid: string;
  photoUrl: string | null;
}): Promise<Player> {
  await loadStore();
  const player = getStore().players.find((p) => p.id === input.playerId);
  if (!player) {
    throw new AppError('NOT_FOUND', 'That player is no longer on the roster');
  }
  if (player.authUid === input.uid) {
    return player;
  }
  if (player.authUid != null) {
    throw new AppError('CONFLICT', 'Someone else has already claimed this player');
  }
  requireNoCardYet(player.leagueId, input.uid);
  const claimed: Player = {
    ...player,
    kind: 'member',
    authUid: input.uid,
    photoUrl: player.photoUrl ?? input.photoUrl,
    updatedAt: nowIso(),
  };
  await savePlayer(claimed);
  logger.info('players.service', 'Player claimed', {
    playerId: claimed.id,
    leagueId: claimed.leagueId,
  });
  return claimed;
}

/** "I'm new here": create this person's own card with the name they chose. */
export async function createOwnPlayer(input: {
  leagueId: string;
  uid: string;
  displayName: string;
  photoUrl: string | null;
}): Promise<Player> {
  const name = z.string().trim().min(2).max(40).safeParse(input.displayName);
  if (!name.success) {
    throw new AppError('VALIDATION', 'Your name must be 2 to 40 characters');
  }
  await loadStore();
  const id = memberPlayerId(input.leagueId, input.uid);
  const existing = getStore().players.find((p) => p.id === id);
  if (existing) {
    return existing;
  }
  requireNoCardYet(input.leagueId, input.uid);
  requireUniqueDisplayName(input.leagueId, name.data);
  const player = makeMemberPlayer(input.leagueId, input.uid, name.data, input.photoUrl);
  await savePlayer(player);
  logger.info('players.service', 'Own player created', {
    playerId: player.id,
    leagueId: player.leagueId,
  });
  return player;
}

function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase();
}

export function isDisplayNameTaken(
  leagueId: string,
  displayName: string,
  exceptPlayerId?: string,
): boolean {
  const needle = normalizePlayerName(displayName);
  if (needle.length === 0) {
    return false;
  }
  return getStore().players.some(
    (p) =>
      p.leagueId === leagueId &&
      p.id !== exceptPlayerId &&
      normalizePlayerName(p.displayName) === needle,
  );
}

function requireUniqueDisplayName(
  leagueId: string,
  displayName: string,
  exceptPlayerId?: string,
): void {
  if (isDisplayNameTaken(leagueId, displayName, exceptPlayerId)) {
    throw new AppError('CONFLICT', 'That name is already on the roster. Use a different name.');
  }
}

export function uniqueDisplayName(leagueId: string, desired: string): string {
  const base = desired.trim();
  if (base.length === 0 || !isDisplayNameTaken(leagueId, base)) {
    return base;
  }
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base} ${n}`;
    if (!isDisplayNameTaken(leagueId, candidate)) {
      return candidate;
    }
  }
  throw new AppError('CONFLICT', 'That name is already on the roster. Use a different name.');
}

function playerInLiveEvent(playerId: string): boolean {
  const store = getStore();
  const inMatch = store.matches.some(
    (m) =>
      m.outcome.status === 'in_progress' &&
      (m.teamA.includes(playerId) || m.teamB.includes(playerId)),
  );
  if (inMatch) {
    return true;
  }
  return store.races.some(
    (r) => r.status === 'in_progress' && r.entrants.some((e) => e.playerId === playerId),
  );
}

export async function renamePlayer(playerId: string, displayName: string): Promise<Player> {
  const parsed = z.string().trim().min(2).max(40).safeParse(displayName);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Name must be at least 2 characters');
  }
  await loadStore();
  const player = getStore().players.find((p) => p.id === playerId);
  if (!player) {
    throw new AppError('NOT_FOUND', 'Player not found');
  }
  requireUniqueDisplayName(player.leagueId, parsed.data, playerId);
  const updated: Player = {
    ...player,
    displayName: parsed.data,
    updatedAt: nowIso(),
  };
  await updateStore((s) => ({
    ...s,
    players: s.players.map((p) => (p.id === playerId ? updated : p)),
  }));
  await scheduleSync([
    {
      entity: 'player',
      docId: updated.id,
      leagueId: updated.leagueId,
      action: 'upsert',
      payload: updated,
      updatedAt: updated.updatedAt,
    },
  ]);
  logger.info('players.service', 'Player renamed', { playerId });
  return updated;
}

export async function deletePlayer(playerId: string, actorUid: string): Promise<void> {
  await loadStore();
  const player = getStore().players.find((p) => p.id === playerId);
  if (!player) {
    throw new AppError('NOT_FOUND', 'Player not found');
  }
  if (player.authUid && player.authUid === actorUid) {
    throw new AppError('FORBIDDEN', "You can't delete your own player card");
  }
  const league = getStore().leagues.find((l) => l.id === player.leagueId);
  if (!league || league.createdByUid !== actorUid) {
    throw new AppError('FORBIDDEN', 'Only the league creator can delete players');
  }
  if (playerInLiveEvent(playerId)) {
    throw new AppError('INVALID_STATE', 'Finish or undo their live match or race first');
  }
  await updateStore((s) => ({
    ...s,
    players: s.players.filter((p) => p.id !== playerId),
  }));
  await scheduleSync([
    {
      entity: 'player',
      docId: player.id,
      leagueId: player.leagueId,
      action: 'delete',
      payload: null,
      updatedAt: nowIso(),
    },
  ]);
  logger.info('players.service', 'Player deleted', { playerId, leagueId: player.leagueId });
}
