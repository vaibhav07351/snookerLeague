import { z } from 'zod';

import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { createId, nowIso } from '@/shared/utils/id';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
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
  return (
    getStore().players.find((p) => p.leagueId === leagueId && p.authUid === authUid) ?? null
  );
}

export async function addGuestPlayer(input: {
  leagueId: string;
  displayName: string;
}): Promise<Player> {
  const parsed = guestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Guest name must be at least 2 characters');
  }

  const player: Player = {
    id: createId('plr'),
    leagueId: parsed.data.leagueId,
    displayName: parsed.data.displayName,
    kind: 'guest',
    authUid: null,
    photoUrl: null,
    createdAt: nowIso(),
    stats: { standard: emptyStandardStats(), race: emptyRaceStats() },
  };

  await updateStore((s) => ({ ...s, players: [...s.players, player] }));
  logger.info('players.service', 'Guest added', { playerId: player.id, leagueId: player.leagueId });
  return player;
}
