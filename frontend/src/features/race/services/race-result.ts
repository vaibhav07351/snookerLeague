import {
  compareRaceBoard,
  netRaceScore,
  raceShotSummary,
} from '@/features/race/services/race-helpers';
import { breakNote, presentLines } from '@/features/result/services/result-view';
import type { ResultRow, ResultView } from '@/features/result/types/result.types';
import type { Race } from '@/shared/types/domain';

/** Final places of a race, best first ("Out" for players who did not finish). */
export function raceStandings(race: Race, nameOf: (playerId: string) => string): ResultRow[] {
  return [...race.entrants].sort(compareRaceBoard).map((e, i) => ({
    place: e.place === 'dnf' ? 'Out' : String(typeof e.place === 'number' ? e.place : i + 1),
    name: nameOf(e.playerId),
    detail: `${netRaceScore(e)} pts`,
    winner: race.status === 'completed' && e.place === 1,
  }));
}

/** The result card of a finished race; null while it is still being played. */
export function raceResultView(
  race: Race,
  nameOf: (playerId: string) => string,
): ResultView | null {
  if (race.status !== 'completed') {
    return null;
  }
  const standings = raceStandings(race, nameOf);
  const winnerEntrant = race.entrants.find((e) => e.place === 1);
  const best = Object.values(raceShotSummary(race.liveShots)).reduce(
    (max, s) => Math.max(max, s.bestBreak),
    0,
  );
  const target = `Race to ${race.targetScore}`;
  const winnerLabel = winnerEntrant ? nameOf(winnerEntrant.playerId) : null;
  return {
    kind: 'race',
    id: race.id,
    kicker: race.crownsRaceChampion ? 'Race king race' : 'Race complete',
    label: race.namedLabel || target,
    caption: race.namedLabel ? target : `${race.entrants.length} players`,
    mood: race.crownsRaceChampion ? 'crown' : 'win',
    live: false,
    score: winnerEntrant ? String(netRaceScore(winnerEntrant)) : '-',
    scoreUnit: 'points',
    winnerLabel,
    winnerHeading: 'Winner',
    sides: null,
    standings,
    notes: presentLines([
      race.crownsRaceChampion && winnerLabel ? 'New race king' : null,
      breakNote(best),
    ]),
    summary: winnerLabel ? `${winnerLabel} wins the ${target.toLowerCase()}` : target,
  };
}
