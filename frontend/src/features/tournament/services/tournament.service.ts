import { z } from 'zod';

import * as matchService from '@/features/match/services/match.service';
import {
  deriveTournament,
  roundName,
  type TournamentState,
} from '@/features/tournament/services/bracket';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleSync } from '@/shared/sync';
import type { Match, Tournament, TournamentFormat } from '@/shared/types/domain';
import { createId, nowIso } from '@/shared/utils/id';

const createSchema = z.object({
  leagueId: z.string().min(1),
  uid: z.string().min(1),
  name: z.string().trim().min(2).max(40),
  format: z.enum(['knockout', 'round_robin']),
  entrants: z
    .array(z.string().min(1))
    .min(2)
    .max(32)
    .refine((ids) => new Set(ids).size === ids.length, 'Each player can enter once'),
  bestOf: z.number().int().min(1).max(35),
});

/** Round robin grows as n*(n-1)/2 fixtures; past 12 players that is over 60 matches. */
const MAX_ROUND_ROBIN = 12;

export async function listTournaments(leagueId: string): Promise<Tournament[]> {
  await loadStore();
  return getStore()
    .tournaments.filter((t) => t.leagueId === leagueId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTournament(id: string): Promise<Tournament | null> {
  await loadStore();
  return getStore().tournaments.find((t) => t.id === id) ?? null;
}

/** The tournament's fixtures and computed state (bracket or table). */
export function stateOf(tournament: Tournament): { state: TournamentState; fixtures: Match[] } {
  const fixtures = getStore().matches.filter((m) => m.tournamentId === tournament.id);
  return { state: deriveTournament(tournament, fixtures), fixtures };
}

export async function createTournament(input: {
  leagueId: string;
  uid: string;
  name: string;
  format: TournamentFormat;
  entrants: string[];
  bestOf: number;
}): Promise<Tournament> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      'VALIDATION',
      'Give the tournament a name (2 to 40 letters) and pick at least 2 different players.',
    );
  }
  if (parsed.data.format === 'round_robin' && parsed.data.entrants.length > MAX_ROUND_ROBIN) {
    throw new AppError(
      'VALIDATION',
      `Round robin works best with up to ${MAX_ROUND_ROBIN} players. Use knockout for more.`,
    );
  }
  await loadStore();
  const roster = new Set(
    getStore()
      .players.filter((p) => p.leagueId === parsed.data.leagueId)
      .map((p) => p.id),
  );
  if (!parsed.data.entrants.every((id) => roster.has(id))) {
    throw new AppError('VALIDATION', 'Every entrant must be a player in this league.');
  }
  const now = nowIso();
  const tournament: Tournament = {
    id: createId('tn'),
    leagueId: parsed.data.leagueId,
    name: parsed.data.name,
    format: parsed.data.format,
    entrants: parsed.data.entrants,
    bestOf: parsed.data.bestOf,
    createdByUid: parsed.data.uid,
    createdAt: now,
    updatedAt: now,
  };
  await updateStore((s) => ({ ...s, tournaments: [...s.tournaments, tournament] }));
  await scheduleSync([
    {
      entity: 'tournament',
      docId: tournament.id,
      leagueId: tournament.leagueId,
      action: 'upsert',
      payload: tournament,
      updatedAt: tournament.updatedAt,
    },
  ]);
  logger.info('tournament.service', 'Tournament created', { tournamentId: tournament.id });
  return tournament;
}

/**
 * Start the fixture for one bracket slot (knockout) or pairing (round robin). The match is a
 * normal league match tagged with the tournament, so it is scored, synced and shown like any
 * other, and its result moves the winner on.
 */
export async function startFixture(input: {
  tournamentId: string;
  round: number;
  slot: number;
  uid: string;
}): Promise<Match> {
  const tournament = await getTournament(input.tournamentId);
  if (!tournament) {
    throw new AppError('NOT_FOUND', 'Tournament not found');
  }
  const { state, fixtures } = stateOf(tournament);
  const existing = fixtures.find((m) => m.round === input.round && m.slot === input.slot);
  if (existing) {
    return existing;
  }
  let a = '';
  let b = '';
  let label = tournament.name;
  if (state.format === 'knockout') {
    const slot = state.rounds?.[input.round]?.[input.slot];
    a = slot?.a ?? '';
    b = slot?.b ?? '';
    label = `${tournament.name} - ${roundName(input.round, state.rounds?.length ?? 1)}`;
  } else {
    const pairing = state.pairings?.[input.slot];
    a = pairing?.a ?? '';
    b = pairing?.b ?? '';
  }
  if (!a || !b) {
    throw new AppError('INVALID_STATE', 'Both players for this fixture are not known yet.');
  }
  return matchService.createMatch({
    leagueId: tournament.leagueId,
    createdByUid: input.uid,
    format: 'singles',
    teamA: [a],
    teamB: [b],
    bestOf: tournament.bestOf,
    namedLabel: label,
    crownsChampion: false,
    fixture: { tournamentId: tournament.id, round: input.round, slot: input.slot },
  });
}

/** Organiser or league owner only. The fixtures stay as ordinary league matches. */
export async function deleteTournament(id: string, uid: string): Promise<void> {
  const tournament = await getTournament(id);
  if (!tournament) {
    return;
  }
  const league = getStore().leagues.find((l) => l.id === tournament.leagueId);
  if (tournament.createdByUid !== uid && league?.createdByUid !== uid) {
    throw new AppError('FORBIDDEN', 'Only the organiser or league owner can delete it');
  }
  await updateStore((s) => ({ ...s, tournaments: s.tournaments.filter((t) => t.id !== id) }));
  await scheduleSync([
    {
      entity: 'tournament',
      docId: id,
      leagueId: tournament.leagueId,
      action: 'delete',
      payload: null,
      updatedAt: nowIso(),
    },
  ]);
}
