import { highestBreakFromShots } from '@/features/match/services/frame-engine';
import { breakNote, presentLines } from '@/features/result/services/result-view';
import type { ResultMood, ResultView } from '@/features/result/types/result.types';
import type { Match } from '@/shared/types/domain';

/** Highest break anyone made in the match. */
export function matchHighestBreak(match: Match): number {
  return match.frames.reduce((max, f) => Math.max(max, highestBreakFromShots(f.shots ?? [])), 0);
}

interface MatchNames {
  /** Full side names, e.g. "Rahul Sharma & Amit Kumar". */
  sideA: string;
  sideB: string;
}

/** The result card of a finished match; null while it is still being played. */
export function matchResultView(match: Match, names: MatchNames): ResultView | null {
  const { outcome } = match;
  if (outcome.status === 'in_progress') {
    return null;
  }
  const mood: ResultMood = match.crownsChampion
    ? 'crown'
    : outcome.status === 'forfeited'
      ? 'forfeit'
      : 'win';
  const winnerSide = outcome.winner;
  const winners = winnerSide === 'a' ? match.teamA : match.teamB;
  return {
    kind: 'match',
    id: match.id,
    kicker:
      mood === 'crown' ? 'Title match' : mood === 'forfeit' ? 'Forfeit result' : 'Match complete',
    label: match.namedLabel || (match.crownsChampion ? 'Title match' : 'Snooker match'),
    caption: `Best of ${match.bestOf}`,
    mood,
    live: false,
    score: `${outcome.framesA}-${outcome.framesB}`,
    scoreUnit: null,
    winnerLabel: winnerSide === 'a' ? names.sideA : names.sideB,
    winnerHeading: winners.length > 1 ? 'Winners' : 'Winner',
    sides: {
      a: names.sideA,
      b: names.sideB,
      framesA: outcome.framesA,
      framesB: outcome.framesB,
      winner: winnerSide,
    },
    standings: [],
    notes: presentLines([
      match.crownsChampion ? 'New reigning champions' : null,
      breakNote(matchHighestBreak(match)),
    ]),
    summary: `${names.sideA} ${outcome.framesA} - ${outcome.framesB} ${names.sideB}`,
  };
}
