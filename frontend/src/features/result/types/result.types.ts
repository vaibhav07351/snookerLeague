/** The three kinds of game a result can come from. Also the path word in result links. */
export type ResultKind = 'match' | 'race' | 'group';

/** Sets the celebration's tone and headlines. */
export type ResultMood = 'win' | 'forfeit' | 'crown';

/** One player in a race or free-for-all, best first. */
export interface ResultRow {
  /** "1", "2"... or "Out" for a player who did not finish. */
  place: string;
  name: string;
  /** e.g. "52 pts" or "2 frames · 87 pts". */
  detail: string;
  winner: boolean;
}

/** The two sides of a match, for the share card's score line. */
export interface ResultSides {
  a: string;
  b: string;
  framesA: number;
  framesB: number;
  winner: 'a' | 'b' | null;
}

/**
 * Everything the result screen and share card show, the same for a match, a race and a
 * free-for-all. Built by each game's feature (`toResultView` in its services) or from a
 * public result fetched from the server.
 */
export interface ResultView {
  kind: ResultKind;
  id: string;
  /** Small caps line over the headline, e.g. "Match complete". */
  kicker: string;
  /** The game's name: its own label, or e.g. "Race to 50". */
  label: string;
  /** A second line under the label, e.g. "Best of 5" (null when there is none). */
  caption: string | null;
  mood: ResultMood;
  /** Still being played (public results only; finished games are the usual case). */
  live: boolean;
  /** The big figure: "3-1" for a match, the winner's points or frames otherwise. */
  score: string;
  /** Word after a non-match score, e.g. "points" (null for a match). */
  scoreUnit: string | null;
  /** Who won, e.g. "Rahul & Amit" (null while live). */
  winnerLabel: string | null;
  /** "Winner" or "Winners". */
  winnerHeading: string;
  sides: ResultSides | null;
  standings: ResultRow[];
  /** Extra lines such as "Highest break 52" or "New race king". */
  notes: string[];
  /** One line for shared text, e.g. "Rahul 3 - 1 Amit". */
  summary: string;
}
