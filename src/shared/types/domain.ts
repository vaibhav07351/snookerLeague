export interface StandardStats {
  played: number;
  wins: number;
  winPct: number;
  lastPlayedAt: string | null;
  streak: number;
  titles: number;
  /** Times this player was on the team that forfeited (counts as a harsher loss). */
  forfeits: number;
  /** Wins awarded because the opposing team forfeited. */
  winsByForfeit: number;
  /** Timed frames this player was in (doubles share frame clock). */
  timedFrames: number;
  /** Sum of timed frame durations (seconds). */
  totalFrameSeconds: number;
  /** Average seconds per timed frame. */
  avgFrameSeconds: number | null;
  timedFramesWon: number;
  avgWinFrameSeconds: number | null;
  timedFramesLost: number;
  avgLossFrameSeconds: number | null;
  fastestFrameSeconds: number | null;
  slowestFrameSeconds: number | null;
}

export interface RaceStats {
  played: number;
  firsts: number;
  seconds: number;
  thirds: number;
  podiumPct: number;
  avgPlace: number | null;
  firstPct: number;
  lastPlayedAt: string | null;
  firstStreak: number;
  titles: number;
}

export function emptyStandardStats(): StandardStats {
  return {
    played: 0,
    wins: 0,
    winPct: 0,
    lastPlayedAt: null,
    streak: 0,
    titles: 0,
    forfeits: 0,
    winsByForfeit: 0,
    timedFrames: 0,
    totalFrameSeconds: 0,
    avgFrameSeconds: null,
    timedFramesWon: 0,
    avgWinFrameSeconds: null,
    timedFramesLost: 0,
    avgLossFrameSeconds: null,
    fastestFrameSeconds: null,
    slowestFrameSeconds: null,
  };
}

export function emptyRaceStats(): RaceStats {
  return {
    played: 0,
    firsts: 0,
    seconds: 0,
    thirds: 0,
    podiumPct: 0,
    avgPlace: null,
    firstPct: 0,
    lastPlayedAt: null,
    firstStreak: 0,
    titles: 0,
  };
}

export interface Player {
  id: string;
  leagueId: string;
  displayName: string;
  kind: 'member' | 'guest';
  authUid: string | null;
  photoUrl: string | null;
  createdAt: string;
  stats: {
    standard: StandardStats;
    race: RaceStats;
  };
}

export interface TeamChampions {
  /** One id for singles crown, two for doubles. */
  playerIds: string[];
  matchId: string;
  namedLabel: string | null;
  crownedAt: string;
}

export interface RaceKing {
  playerId: string;
  raceId: string;
  namedLabel: string | null;
  crownedAt: string;
}

export interface League {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  createdByUid: string;
  memberUids: string[];
  defaultRaceTarget: number;
  defaultBestOf: number;
  reigningTeam: TeamChampions | null;
  raceKing: RaceKing | null;
}

export interface FrameScore {
  teamAPoints: number;
  teamBPoints: number;
  winner: 'a' | 'b';
  /** True when this frame was awarded because a side forfeited it. */
  viaForfeit?: boolean;
  /** Elapsed seconds when auto-timing was on for this frame. */
  durationSeconds?: number;
}

export type MatchOutcome =
  | {
      status: 'completed';
      winner: 'a' | 'b';
      framesA: number;
      framesB: number;
    }
  | {
      status: 'forfeited';
      winner: 'a' | 'b';
      forfeitedBy: 'a' | 'b';
      framesA: number;
      framesB: number;
      scoreAtForfeit: {
        framesA: number;
        framesB: number;
        framePointsA: number;
        framePointsB: number;
      };
    }
  | {
      status: 'in_progress';
      framesA: number;
      framesB: number;
    };

export type MatchFormat = 'singles' | 'doubles';

export interface Match {
  id: string;
  leagueId: string;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  /** Defaults to doubles when missing (legacy matches). */
  format?: MatchFormat;
  /** One player (singles) or two (doubles). */
  teamA: string[];
  teamB: string[];
  bestOf: number;
  namedLabel: string | null;
  crownsChampion: boolean;
  frames: FrameScore[];
  outcome: MatchOutcome;
  /** Persist auto frame timer preference for this match. */
  timingEnabled?: boolean;
  /** ISO timestamp when the open frame timer started. */
  frameStartedAt?: string | null;
}

export type RacePlace = number | 'dnf';

export interface RaceEntrant {
  playerId: string;
  score: number;
  place: RacePlace | null;
  finishedAt: string | null;
}

export type RaceStatus = 'in_progress' | 'completed';

export interface Race {
  id: string;
  leagueId: string;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  targetScore: number;
  namedLabel: string | null;
  crownsRaceChampion: boolean;
  entrants: RaceEntrant[];
  status: RaceStatus;
}

export type FeedEventType =
  | 'team_crowned'
  | 'team_dethroned'
  | 'race_king'
  | 'match_won'
  | 'race_won'
  | 'streak';

export interface FeedEvent {
  id: string;
  leagueId: string;
  type: FeedEventType;
  createdAt: string;
  title: string;
  body: string;
  relatedIds: string[];
}

export interface SessionUser {
  uid: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  isDemo: boolean;
}

export interface AppDataStore {
  user: SessionUser | null;
  activeLeagueId: string | null;
  leagues: League[];
  players: Player[];
  matches: Match[];
  races: Race[];
  events: FeedEvent[];
}
