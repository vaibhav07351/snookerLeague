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
  /** Highest recorded break (from shot log; 0 if none). */
  highestBreak: number;
  breaks50: number;
  centuries: number;
  maximums: number;
  /** Pots + free balls attributed to this player. */
  pointsScored: number;
  /** Foul shots this player committed (from shot log). */
  fouls: number;
  /** Points conceded on those fouls. */
  foulPoints: number;
  /** pointsScored minus foulPoints. */
  netPoints: number;
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
    highestBreak: 0,
    breaks50: 0,
    centuries: 0,
    maximums: 0,
    pointsScored: 0,
    fouls: 0,
    foulPoints: 0,
    netPoints: 0,
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
  updatedAt: string;
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

export type LeagueKind = 'club' | 'city';

export interface League {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  memberUids: string[];
  defaultRaceTarget: number;
  defaultBestOf: number;
  reigningTeam: TeamChampions | null;
  raceKing: RaceKing | null;
  /** Defaults to club when missing (legacy leagues). */
  kind?: LeagueKind;
  /** Set when kind is city. */
  cityId?: string | null;
}

export function leagueKindOf(league: League): LeagueKind {
  return league.kind === 'city' ? 'city' : 'club';
}

export function cityHubId(cityId: string): string {
  return `city_${cityId}`;
}

export interface FrameScore {
  teamAPoints: number;
  teamBPoints: number;
  winner: 'a' | 'b';
  /** True when this frame was awarded because a side forfeited it. */
  viaForfeit?: boolean;
  /** Elapsed seconds when auto-timing was on for this frame. */
  durationSeconds?: number;
  shots?: Shot[];
  highestBreakA?: number;
  highestBreakB?: number;
}

export type ShotKind = 'pot' | 'foul' | 'miss' | 'safety' | 'free_ball';

export type BallValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Shot {
  id: string;
  at: string;
  side: 'a' | 'b';
  kind: ShotKind;
  points: number;
  ball?: BallValue;
  /** League player id whose visit this shot belongs to (doubles). */
  playerId?: string | null;
}

export interface OpenFrame {
  shots: Shot[];
  teamAPoints: number;
  teamBPoints: number;
  atTable: 'a' | 'b';
  currentBreak: number;
  currentBreakSide: 'a' | 'b';
  /** Player currently scoring; points on this visit count under them. */
  atTablePlayerId?: string | null;
  lastPlayerIdBySide?: { a: string | null; b: string | null };
}

export function emptyOpenFrame(
  atTable: 'a' | 'b' = 'a',
  atTablePlayerId: string | null = null,
): OpenFrame {
  return {
    shots: [],
    teamAPoints: 0,
    teamBPoints: 0,
    atTable,
    currentBreak: 0,
    currentBreakSide: atTable,
    atTablePlayerId,
    lastPlayerIdBySide: {
      a: atTable === 'a' ? atTablePlayerId : null,
      b: atTable === 'b' ? atTablePlayerId : null,
    },
  };
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
  /** Live frame in progress; null when scoring a finished frame manually. */
  openFrame?: OpenFrame | null;
  /** Auth uid allowed to record shots. Defaults to createdByUid. */
  scorerUid?: string;
}

export type RacePlace = number | 'dnf';

export type RaceLiveShotKind = 'pot' | 'foul' | 'miss';

export interface RaceLiveShot {
  id: string;
  at: string;
  playerId: string;
  kind: RaceLiveShotKind;
  points: number;
  ball?: BallValue;
}

export interface RaceEntrant {
  playerId: string;
  score: number;
  /** Points conceded on fouls in this race. */
  foulPoints?: number;
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
  /** Player whose next pot / foul is logged. */
  atTablePlayerId?: string | null;
  liveShots?: RaceLiveShot[];
}

export type FeedEventType =
  'team_crowned' | 'team_dethroned' | 'race_king' | 'match_won' | 'race_won' | 'streak';

export interface FeedEvent {
  id: string;
  leagueId: string;
  type: FeedEventType;
  createdAt: string;
  updatedAt: string;
  title: string;
  body: string;
  relatedIds: string[];
}

export type SyncEntity =
  | 'user'
  | 'league'
  | 'player'
  | 'match'
  | 'race'
  | 'event'
  | 'profile'
  | 'challenge'
  | 'looking'
  | 'directory'
  | 'follow';

export type SyncAction = 'upsert' | 'delete';

/** Queued cloud mutation for local-first sync. */
export interface PendingOp {
  opId: string;
  entity: SyncEntity;
  docId: string;
  /** Null for user docs. */
  leagueId: string | null;
  action: SyncAction;
  /** Full document for upsert; null for delete. */
  payload: unknown | null;
  updatedAt: string;
  attempts: number;
}

/** Amateur snooker age band, derived from date of birth. */
export type SnookerDivision = 'u16' | 'u18' | 'u21' | 'open' | 'masters' | 'seniors';

/** Cloud user profile (Firestore users/{uid}). */
export interface CloudUserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  leagueIds: string[];
  activeLeagueId: string | null;
  updatedAt: string;
  cityId: string | null;
  cityName: string | null;
  /** ISO date YYYY-MM-DD. Private — not copied to public playerProfiles. */
  dateOfBirth: string | null;
}

export interface SessionUser {
  uid: string;
  displayName: string;
  email: string | null;
  photoUrl: string | null;
  isDemo: boolean;
  cityId: string | null;
  cityName: string | null;
  /** Demo users may skip city onboarding. */
  citySkipped?: boolean;
  /** ISO date YYYY-MM-DD. */
  dateOfBirth?: string | null;
}

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface Challenge {
  id: string;
  fromUid: string;
  toUid: string;
  cityId: string;
  format: MatchFormat;
  bestOf: number;
  status: ChallengeStatus;
  matchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProfile {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  cityId: string | null;
  cityName: string | null;
  createdAt: string;
  updatedAt: string;
  rankScore: number;
  played: number;
  winPct: number;
  titles: number;
  highestBreak: number;
  centuries: number;
  breaks50: number;
  maximums: number;
  /** Public age band only — never the raw date of birth. */
  division?: SnookerDivision | null;
}

export function emptyPlayerProfile(
  uid: string,
  displayName: string,
  photoUrl: string | null,
): PlayerProfile {
  const stamp = new Date().toISOString();
  return {
    uid,
    displayName,
    photoUrl,
    cityId: null,
    cityName: null,
    createdAt: stamp,
    updatedAt: stamp,
    rankScore: 0,
    played: 0,
    winPct: 0,
    titles: 0,
    highestBreak: 0,
    centuries: 0,
    breaks50: 0,
    maximums: 0,
    division: null,
  };
}

export type LookingKind = 'opponent' | 'player' | 'club' | 'table';

export type LookingStatus = 'open' | 'closed';

export interface LookingPost {
  id: string;
  cityId: string;
  cityName: string;
  createdByUid: string;
  authorName: string;
  kind: LookingKind;
  title: string;
  body: string;
  status: LookingStatus;
  createdAt: string;
  updatedAt: string;
}

export type DirectoryKind = 'club' | 'table' | 'referee' | 'organiser';

export interface DirectoryListing {
  id: string;
  cityId: string;
  cityName: string;
  kind: DirectoryKind;
  name: string;
  detail: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowEdge {
  id: string;
  followerUid: string;
  followingUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppDataStore {
  user: SessionUser | null;
  activeLeagueId: string | null;
  leagues: League[];
  players: Player[];
  matches: Match[];
  races: Race[];
  events: FeedEvent[];
  pendingOps: PendingOp[];
  playerProfiles: PlayerProfile[];
  challenges: Challenge[];
  lookingPosts: LookingPost[];
  directoryListings: DirectoryListing[];
  follows: FollowEdge[];
}
