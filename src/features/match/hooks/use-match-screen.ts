import { useCallback, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import * as leagueService from '@/features/league/services/league.service';
import {
  canManageMatch,
  canTakeOverScoring,
  currentScorerUid,
  isMatchScorer,
} from '@/features/match/services/match-access';
import * as matchAdmin from '@/features/match/services/match-admin.service';
import { summarizeMatch, type MatchSummary } from '@/features/match/services/match-summary';
import * as matchService from '@/features/match/services/match.service';
import * as shotService from '@/features/match/services/shot.service';
import { tableStateOf, type TableState } from '@/features/match/services/table-state';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { notify } from '@/shared/ui/notify';
import { shortNames } from '@/shared/utils/names';
import type { League, Match, Player } from '@/shared/types/domain';

export interface MatchScreenState {
  /** undefined while loading, null when the match does not exist (or was deleted). */
  match: Match | null | undefined;
  league: League | null;
  players: Player[];
  fullName: (playerId: string) => string;
  shortName: (playerId: string) => string;
  sideLabel: (side: 'a' | 'b', short?: boolean) => string;
  table: TableState | null;
  /** Live totals, including the frame in progress. */
  summary: MatchSummary | null;
  canScore: boolean;
  canTakeOver: boolean;
  canManage: boolean;
  scorerName: string | null;
  /** League members with an account (candidates for "who can score"). */
  memberPlayers: Player[];
  busy: boolean;
  /** Run a service call; failures become a toast. Resolves true on success. */
  run: (label: string, action: () => Promise<unknown>) => Promise<boolean>;
  actions: {
    pot: (ball: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
    foul: (points: number) => void;
    endVisit: (kind: 'miss' | 'safety') => void;
    freeBall: () => void;
    undoShot: () => Promise<boolean>;
    selectPlayer: (playerId: string) => void;
  };
}

export function useMatchScreen(matchId: string | undefined): MatchScreenState {
  const { user } = useSession();
  const [match, setMatch] = useState<Match | null | undefined>(undefined);
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!matchId) {
      setMatch(null);
      return;
    }
    const m = await matchService.getMatch(matchId);
    setMatch((prev) => (prev === m ? prev : m));
    if (m) {
      const [list, lg] = await Promise.all([
        playersService.listPlayers(m.leagueId),
        leagueService.getLeague(m.leagueId),
      ]);
      setPlayers(list);
      setLeague(lg);
    }
  }, [matchId]);

  useStoreReload(reload, matchId ?? null);

  const derived = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p]));
    const fullName = (id: string): string => byId.get(id)?.displayName ?? 'Player';
    const roster = match ? [...match.teamA, ...match.teamB] : [];
    const shorts = shortNames(roster.map((id) => ({ id, name: fullName(id) })));
    const shortName = (id: string): string => shorts[id] ?? fullName(id);
    const sideLabel = (side: 'a' | 'b', short = false): string => {
      const ids = match ? (side === 'a' ? match.teamA : match.teamB) : [];
      return ids.map(short ? shortName : fullName).join(' & ') || '-';
    };
    const scorerUid = match ? currentScorerUid(match) : null;
    const scorer = players.find((p) => p.authUid != null && p.authUid === scorerUid);
    return {
      fullName,
      shortName,
      sideLabel,
      table: match?.openFrame ? tableStateOf(match.openFrame) : null,
      summary: match ? summarizeMatch(match, match.outcome.status === 'in_progress') : null,
      canScore: match ? isMatchScorer(match, user?.uid) : false,
      canTakeOver: match ? canTakeOverScoring(match, league, user?.uid) : false,
      canManage: match ? canManageMatch(match, league, user?.uid) : false,
      scorerName: scorer ? scorer.displayName : null,
      memberPlayers: players.filter((p) => p.authUid != null),
    };
  }, [match, players, league, user?.uid]);

  const run = useCallback(async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      notify.error(label, toUserMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const id = match?.id;
  const actions = useMemo(() => {
    // Shot taps are fire-and-forget so rapid taps never wait on each other; each write
    // re-reads the latest match from the store, so order is preserved.
    const shot = (label: string, fn: (mid: string) => Promise<unknown>): void => {
      if (!id) {
        return;
      }
      fn(id).catch((error: unknown) => notify.error(label, toUserMessage(error)));
    };
    return {
      pot: (ball: 1 | 2 | 3 | 4 | 5 | 6 | 7) =>
        shot('Could not record pot', (mid) => shotService.recordShot(mid, { kind: 'pot', ball })),
      foul: (points: number) =>
        shot('Could not record foul', (mid) =>
          shotService.recordShot(mid, { kind: 'foul', points }),
        ),
      endVisit: (kind: 'miss' | 'safety') =>
        shot('Could not end visit', (mid) => shotService.recordShot(mid, { kind })),
      freeBall: () =>
        shot('Could not record free ball', (mid) =>
          shotService.recordShot(mid, { kind: 'free_ball' }),
        ),
      undoShot: () =>
        id ? run('Could not undo', () => shotService.undoLastShot(id)) : Promise.resolve(false),
      selectPlayer: (playerId: string) =>
        shot('Could not change player', (mid) => shotService.setAtTablePlayer(mid, playerId)),
    };
  }, [id, run]);

  return { match, league, players, busy, run, actions, ...derived };
}

export { matchAdmin, matchService, shotService };
