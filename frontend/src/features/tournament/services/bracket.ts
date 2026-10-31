import type { Match, Tournament } from '@/shared/types/domain';

/**
 * Works out a tournament's state from its fixtures (matches tagged with tournamentId, round
 * and slot). Nothing is stored: winners advance because the bracket is recomputed from the
 * results, the same way on every phone and on the public page. The server has the same
 * logic in Go (backend/internal/tournament); fixtures/tournament keeps them equal.
 */

export interface BracketSlot {
  round: number;
  slot: number;
  /** '' = a bye, or not decided yet. */
  a: string;
  b: string;
  /** Player id, '' until decided. */
  winner: string;
  matchId: string;
  framesA: number;
  framesB: number;
}

export interface RoundRobinRow {
  playerId: string;
  played: number;
  won: number;
  lost: number;
  framesFor: number;
  framesAgainst: number;
  points: number;
}

export interface RoundRobinPairing {
  slot: number;
  a: string;
  b: string;
  winner: string;
  matchId: string;
}

export interface TournamentState {
  format: Tournament['format'];
  rounds?: BracketSlot[][];
  pairings?: RoundRobinPairing[];
  standings?: RoundRobinRow[];
  champion: string;
  completed: boolean;
}

function finished(m: Match): boolean {
  return m.outcome.status === 'completed' || m.outcome.status === 'forfeited';
}

function winnerOf(m: Match): string {
  if (m.outcome.status !== 'completed' && m.outcome.status !== 'forfeited') {
    return '';
  }
  const team = m.outcome.winner === 'b' ? m.teamB : m.teamA;
  return team[0] ?? '';
}

/** Standard bracket order: seed numbers (1-based) by position, top seeds meet late. */
export function seedPositions(size: number): number[] {
  let pos = [1, 2];
  while (pos.length < size) {
    const n = pos.length * 2 + 1;
    pos = pos.flatMap((s) => [s, n - s]);
  }
  return pos;
}

function bracketSize(entrants: number): number {
  let size = 2;
  while (size < entrants) {
    size *= 2;
  }
  return size;
}

/** Every pairing once, in a fixed order; the index is the fixture's slot. */
export function roundRobinPairs(entrants: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < entrants.length; i += 1) {
    for (let j = i + 1; j < entrants.length; j += 1) {
      out.push([entrants[i]!, entrants[j]!]);
    }
  }
  return out;
}

function fixtureMap(tournament: Tournament, matches: Match[]): Map<string, Match> {
  const byKey = new Map<string, Match>();
  for (const m of matches) {
    if (m.tournamentId !== tournament.id || m.round == null || m.slot == null) {
      continue;
    }
    const key = `${m.round}:${m.slot}`;
    const prev = byKey.get(key);
    // Prefer a finished fixture if a slot was (wrongly) played twice.
    if (!prev || (!finished(prev) && finished(m))) {
      byKey.set(key, m);
    }
  }
  return byKey;
}

function knockout(t: Tournament, fixtures: Map<string, Match>): TournamentState {
  const size = bracketSize(t.entrants.length);
  const seeds = seedPositions(size);
  const entrant = (seed: number): string =>
    seed <= t.entrants.length ? (t.entrants[seed - 1] ?? '') : '';
  const rounds: BracketSlot[][] = [];
  let prev: BracketSlot[] = [];
  for (let round = 0; size >> round > 1; round += 1) {
    const count = size >> (round + 1);
    const slots: BracketSlot[] = [];
    for (let s = 0; s < count; s += 1) {
      const slot: BracketSlot = {
        round,
        slot: s,
        a: round === 0 ? entrant(seeds[2 * s]!) : prev[2 * s]!.winner,
        b: round === 0 ? entrant(seeds[2 * s + 1]!) : prev[2 * s + 1]!.winner,
        winner: '',
        matchId: '',
        framesA: 0,
        framesB: 0,
      };
      if (round === 0 && slot.a && !slot.b) {
        slot.winner = slot.a; // bye
      } else if (round === 0 && slot.b && !slot.a) {
        slot.winner = slot.b;
      } else {
        const f = fixtures.get(`${round}:${s}`);
        if (f) {
          slot.matchId = f.id;
          slot.framesA = f.outcome.framesA;
          slot.framesB = f.outcome.framesB;
          if (slot.a && slot.b) {
            slot.winner = winnerOf(f);
          }
        }
      }
      slots.push(slot);
    }
    rounds.push(slots);
    prev = slots;
  }
  const final = prev.length === 1 ? prev[0] : undefined;
  return {
    format: 'knockout',
    rounds,
    champion: final?.winner ?? '',
    completed: Boolean(final?.winner),
  };
}

function roundRobin(t: Tournament, fixtures: Map<string, Match>): TournamentState {
  const rows = new Map<string, RoundRobinRow>();
  const seed = new Map<string, number>();
  t.entrants.forEach((id, i) => {
    rows.set(id, {
      playerId: id,
      played: 0,
      won: 0,
      lost: 0,
      framesFor: 0,
      framesAgainst: 0,
      points: 0,
    });
    seed.set(id, i);
  });
  const pairs = roundRobinPairs(t.entrants);
  let done = 0;
  const pairings: RoundRobinPairing[] = pairs.map(([pa, pb], i) => {
    const pairing: RoundRobinPairing = { slot: i, a: pa, b: pb, winner: '', matchId: '' };
    const f = fixtures.get(`0:${i}`);
    if (!f) {
      return pairing;
    }
    pairing.matchId = f.id;
    const w = winnerOf(f);
    if (!w) {
      return pairing;
    }
    pairing.winner = w;
    done += 1;
    // Frames are counted from each player's own side, whichever side they played.
    const swapped = f.teamA[0] === pb;
    const aFrames = swapped ? f.outcome.framesB : f.outcome.framesA;
    const bFrames = swapped ? f.outcome.framesA : f.outcome.framesB;
    const a = rows.get(pa)!;
    const b = rows.get(pb)!;
    a.played += 1;
    b.played += 1;
    a.framesFor += aFrames;
    a.framesAgainst += bFrames;
    b.framesFor += bFrames;
    b.framesAgainst += aFrames;
    if (w === pa) {
      a.won += 1;
      b.lost += 1;
    } else {
      b.won += 1;
      a.lost += 1;
    }
    return pairing;
  });
  const standings = t.entrants.map((id) => {
    const r = rows.get(id)!;
    return { ...r, points: 2 * r.won };
  });
  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.framesFor - b.framesAgainst - (a.framesFor - a.framesAgainst) ||
      b.framesFor - a.framesFor ||
      (seed.get(a.playerId) ?? 0) - (seed.get(b.playerId) ?? 0),
  );
  const completed = pairs.length > 0 && done === pairs.length;
  return {
    format: 'round_robin',
    pairings,
    standings,
    champion: completed ? (standings[0]?.playerId ?? '') : '',
    completed,
  };
}

export function deriveTournament(tournament: Tournament, matches: Match[]): TournamentState {
  const fixtures = fixtureMap(tournament, matches);
  return tournament.format === 'knockout'
    ? knockout(tournament, fixtures)
    : roundRobin(tournament, fixtures);
}

/** Name of a knockout round counted from the start. */
export function roundName(round: number, rounds: number): string {
  const left = rounds - round;
  if (left === 1) {
    return 'Final';
  }
  if (left === 2) {
    return 'Semi-finals';
  }
  if (left === 3) {
    return 'Quarter-finals';
  }
  return `Round of ${2 ** left}`;
}
