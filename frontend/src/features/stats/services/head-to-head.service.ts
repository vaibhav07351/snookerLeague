import type { Match, Race } from '@/shared/types/domain';

export type MeetingWinner = 'a' | 'b' | 'draw';

/** One time two players met, told from player A's side. */
export interface Meeting {
  kind: 'match' | 'race';
  id: string;
  at: string;
  winner: MeetingWinner;
  /** Short score, e.g. "3-1" (frames) or "1st v 3rd". */
  score: string;
}

export interface HeadToHead {
  aId: string;
  bId: string;
  /** Matches where A and B were on opposite sides. */
  matchesPlayed: number;
  aWins: number;
  bWins: number;
  aFrames: number;
  bFrames: number;
  /** Finished races both entered. */
  racesShared: number;
  aAhead: number;
  bAhead: number;
  /** Doubles matches where A and B were partners. */
  partnerPlayed: number;
  partnerWins: number;
  /** Newest first, at most `MEETINGS_SHOWN`. */
  meetings: Meeting[];
}

export const MEETINGS_SHOWN = 5;

function sideOf(match: Match, playerId: string): 'a' | 'b' | null {
  if (match.teamA.includes(playerId)) {
    return 'a';
  }
  if (match.teamB.includes(playerId)) {
    return 'b';
  }
  return null;
}

function ordinal(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${place}th`;
  }
  const suffix = place % 10 === 1 ? 'st' : place % 10 === 2 ? 'nd' : place % 10 === 3 ? 'rd' : 'th';
  return `${place}${suffix}`;
}

function placeLabel(place: Race['entrants'][number]['place']): string {
  return typeof place === 'number' ? ordinal(place) : 'DNF';
}

function placeKey(place: Race['entrants'][number]['place']): number {
  return typeof place === 'number' ? place : Number.POSITIVE_INFINITY;
}

/** Everything A and B have done against (and with) each other. */
export function headToHead(aId: string, bId: string, matches: Match[], races: Race[]): HeadToHead {
  const result: HeadToHead = {
    aId,
    bId,
    matchesPlayed: 0,
    aWins: 0,
    bWins: 0,
    aFrames: 0,
    bFrames: 0,
    racesShared: 0,
    aAhead: 0,
    bAhead: 0,
    partnerPlayed: 0,
    partnerWins: 0,
    meetings: [],
  };
  if (aId === bId) {
    return result;
  }
  const meetings: Meeting[] = [];

  for (const match of matches) {
    const outcome = match.outcome;
    if (outcome.status === 'in_progress') {
      continue;
    }
    const sa = sideOf(match, aId);
    const sb = sideOf(match, bId);
    if (!sa || !sb) {
      continue;
    }
    if (sa === sb) {
      result.partnerPlayed += 1;
      if (outcome.winner === sa) {
        result.partnerWins += 1;
      }
      continue;
    }
    result.matchesPlayed += 1;
    const aFrames = sa === 'a' ? outcome.framesA : outcome.framesB;
    const bFrames = sa === 'a' ? outcome.framesB : outcome.framesA;
    result.aFrames += aFrames;
    result.bFrames += bFrames;
    const aWon = outcome.winner === sa;
    if (aWon) {
      result.aWins += 1;
    } else {
      result.bWins += 1;
    }
    meetings.push({
      kind: 'match',
      id: match.id,
      at: match.updatedAt,
      winner: aWon ? 'a' : 'b',
      score: outcome.status === 'forfeited' ? 'W/O' : `${aFrames}-${bFrames}`,
    });
  }

  for (const race of races) {
    if (race.status !== 'completed') {
      continue;
    }
    const ea = race.entrants.find((e) => e.playerId === aId);
    const eb = race.entrants.find((e) => e.playerId === bId);
    if (!ea || !eb) {
      continue;
    }
    result.racesShared += 1;
    const pa = placeKey(ea.place);
    const pb = placeKey(eb.place);
    const winner: MeetingWinner = pa === pb ? 'draw' : pa < pb ? 'a' : 'b';
    if (winner === 'a') {
      result.aAhead += 1;
    } else if (winner === 'b') {
      result.bAhead += 1;
    }
    meetings.push({
      kind: 'race',
      id: race.id,
      at: race.updatedAt,
      winner,
      score: `${placeLabel(ea.place)} v ${placeLabel(eb.place)}`,
    });
  }

  result.meetings = meetings.sort((x, y) => y.at.localeCompare(x.at)).slice(0, MEETINGS_SHOWN);
  return result;
}

export interface RivalRow {
  playerId: string;
  played: number;
  wins: number;
  losses: number;
}

export interface Rivals {
  /** Partner with the best doubles record together (at least 2 matches). */
  bestPartner: RivalRow | null;
  /** Opponent who has beaten this player most (at least 2 meetings, more losses than wins). */
  nemesis: RivalRow | null;
  /** Opponent this player has beaten most (more wins than losses). */
  favouriteOpponent: RivalRow | null;
  /** Opponent faced most often. */
  mostPlayed: RivalRow | null;
}

const MIN_RIVAL_GAMES = 2;

function bump(map: Map<string, RivalRow>, id: string, won: boolean): void {
  const row = map.get(id) ?? { playerId: id, played: 0, wins: 0, losses: 0 };
  row.played += 1;
  if (won) {
    row.wins += 1;
  } else {
    row.losses += 1;
  }
  map.set(id, row);
}

function winRate(row: RivalRow): number {
  return row.played > 0 ? row.wins / row.played : 0;
}

/** Best partner, nemesis, favourite opponent and most-played opponent from matches. */
export function findRivals(playerId: string, matches: Match[]): Rivals {
  const opponents = new Map<string, RivalRow>();
  const partners = new Map<string, RivalRow>();

  for (const match of matches) {
    const outcome = match.outcome;
    if (outcome.status === 'in_progress') {
      continue;
    }
    const side = sideOf(match, playerId);
    if (!side) {
      continue;
    }
    const won = outcome.winner === side;
    const mine = side === 'a' ? match.teamA : match.teamB;
    const theirs = side === 'a' ? match.teamB : match.teamA;
    for (const id of theirs) {
      bump(opponents, id, won);
    }
    for (const id of mine) {
      if (id !== playerId) {
        bump(partners, id, won);
      }
    }
  }

  const byName = (a: RivalRow, b: RivalRow): number => a.playerId.localeCompare(b.playerId);
  const opponentRows = [...opponents.values()];
  const partnerRows = [...partners.values()].filter((r) => r.played >= MIN_RIVAL_GAMES);

  const bestPartner =
    [...partnerRows].sort(
      (a, b) => winRate(b) - winRate(a) || b.played - a.played || byName(a, b),
    )[0] ?? null;
  const nemesis =
    opponentRows
      .filter((r) => r.played >= MIN_RIVAL_GAMES && r.losses > r.wins)
      .sort((a, b) => b.losses - a.losses || winRate(a) - winRate(b) || byName(a, b))[0] ?? null;
  const favouriteOpponent =
    opponentRows
      .filter((r) => r.played >= MIN_RIVAL_GAMES && r.wins > r.losses)
      .sort((a, b) => b.wins - a.wins || winRate(b) - winRate(a) || byName(a, b))[0] ?? null;
  const mostPlayed =
    [...opponentRows].sort((a, b) => b.played - a.played || byName(a, b))[0] ?? null;

  return { bestPartner, nemesis, favouriteOpponent, mostPlayed };
}
