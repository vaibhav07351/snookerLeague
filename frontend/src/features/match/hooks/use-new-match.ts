import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import * as groupService from '@/features/group/services/group.service';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { notify } from '@/shared/ui/notify';
import type { MatchFormat, Player } from '@/shared/types/domain';

/** What the scorer picks: a two-sided format, or free-for-all (each player for themselves). */
export type NewMatchKind = MatchFormat | 'free_for_all';

/**
 * Players for the picker: you first, then the people you played most recently, then everyone
 * else by name (the list arrives sorted by name).
 */
export function orderForPicking(
  players: Player[],
  myPlayerId: string | null,
  recentIds: string[],
): Player[] {
  const rank = (p: Player): number => {
    if (p.id === myPlayerId) {
      return -1;
    }
    const recent = recentIds.indexOf(p.id);
    return recent >= 0 ? recent : recentIds.length;
  };
  return [...players].sort((a, b) => rank(a) - rank(b));
}

export interface NewMatchForm {
  players: Player[];
  loaded: boolean;
  format: NewMatchKind;
  sideA: string[];
  sideB: string[];
  /** Free-for-all players, in playing order (the first one breaks). */
  group: string[];
  bestOf: number;
  label: string;
  crowns: boolean;
  midway: boolean;
  busy: boolean;
  freeForAll: boolean;
  sizeA: number;
  sizeB: number;
  canCrown: boolean;
  ready: boolean;
  /** Players the chosen format needs. */
  needed: number;
  nameOf: (id: string) => string;
  setBestOf: (n: number) => void;
  setLabel: (label: string) => void;
  setCrowns: (on: boolean) => void;
  setMidway: (on: boolean) => void;
  changeFormat: (next: NewMatchKind) => void;
  /** Tap a player: fills Side A, then Side B (or the playing order). Tap again to remove. */
  toggle: (id: string) => void;
  /** Add a guest by name and seat them in the next empty place. Resolves true on success. */
  addGuest: (name: string) => Promise<boolean>;
  create: () => Promise<void>;
}

export function useNewMatchForm(params: {
  opponentPlayerId?: string;
  leagueId?: string;
}): NewMatchForm {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Singles is what most people play, and needs only you and one more.
  const [format, setFormat] = useState<NewMatchKind>('singles');
  const [sideA, setSideA] = useState<string[]>([]);
  const [sideB, setSideB] = useState<string[]>([]);
  const [group, setGroup] = useState<string[]>([]);
  const [bestOf, setBestOf] = useState(3);
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [midway, setMidway] = useState(false);
  const [busy, setBusy] = useState(false);

  const freeForAll = format === 'free_for_all';
  const [sizeA, sizeB] = freeForAll ? [0, 0] : matchService.sideSizesOf(format);
  const canCrown = !freeForAll && matchService.formatCanCrown(format);
  const scoringLeagueId = params.leagueId || league?.id || null;

  // Set up once per league. Depending on the league object would reset the form every time
  // anything in the league is scored (the object changes on each update).
  const leagueId = league?.id ?? null;
  const defaultBestOf = matchService.oddBestOf(league?.defaultBestOf ?? 3);
  const uid = user?.uid;
  const opponent = params.opponentPlayerId ?? null;
  useEffect(() => {
    if (!leagueId || !scoringLeagueId) {
      return;
    }
    let alive = true;
    setBestOf(defaultBestOf);
    void (async () => {
      try {
        const list = await playersService.listPlayers(scoringLeagueId);
        const me = list.find((p) => p.authUid === uid) ?? null;
        const recent = await matchService.recentCoPlayerIds(scoringLeagueId, me?.id ?? null);
        if (!alive) {
          return;
        }
        setPlayers(orderForPicking(list, me?.id ?? null, recent));
        // You are almost always playing: start with you in Side A.
        setSideA(me ? [me.id] : []);
        setGroup(me ? [me.id] : []);
        if (opponent && opponent !== me?.id) {
          setSideB([opponent]);
        }
      } catch (error) {
        logger.error('use-new-match', 'Could not load the players', {
          shape: error instanceof Error ? error.name : 'unknown',
        });
        notify.error('Could not load the players', toUserMessage(error));
      } finally {
        if (alive) {
          setLoaded(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [leagueId, defaultBestOf, scoringLeagueId, opponent, uid]);

  const nameOf = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    return (id: string): string => byId.get(id) ?? 'Player';
  }, [players]);

  const changeFormat = useCallback(
    (next: NewMatchKind) => {
      setFormat(next);
      if (next === 'free_for_all') {
        // Carry the players already picked over, in the order they were picked.
        setGroup((g) => (g.length > 1 ? g : [...sideA, ...sideB]));
        setCrowns(false);
        setMidway(false);
        return;
      }
      const [capA, capB] = matchService.sideSizesOf(next);
      setSideA((a) => a.slice(0, capA));
      setSideB((b) => b.slice(0, capB));
      if (!matchService.formatCanCrown(next)) {
        setCrowns(false);
      }
    },
    [sideA, sideB],
  );

  /** Seat a player in the next free place; false when every place is taken. */
  const seat = useCallback(
    (id: string): boolean => {
      if (freeForAll) {
        if (group.length >= groupService.MAX_GROUP_PLAYERS) {
          return false;
        }
        setGroup([...group, id]);
        return true;
      }
      if (sideA.length < sizeA) {
        setSideA([...sideA, id]);
        return true;
      }
      if (sideB.length < sizeB) {
        setSideB([...sideB, id]);
        return true;
      }
      return false;
    },
    [freeForAll, group, sideA, sideB, sizeA, sizeB],
  );

  const toggle = useCallback(
    (id: string) => {
      if (freeForAll && group.includes(id)) {
        setGroup(group.filter((x) => x !== id));
      } else if (sideA.includes(id)) {
        setSideA(sideA.filter((x) => x !== id));
      } else if (sideB.includes(id)) {
        setSideB(sideB.filter((x) => x !== id));
      } else {
        seat(id);
      }
    },
    [freeForAll, group, sideA, sideB, seat],
  );

  const addGuest = useCallback(
    async (name: string): Promise<boolean> => {
      if (!scoringLeagueId) {
        return false;
      }
      try {
        const guest = await playersService.addGuestPlayer({
          leagueId: scoringLeagueId,
          displayName: name,
        });
        // Right after you, so the new guest is in view.
        setPlayers((list) => {
          const mine = list[0]?.authUid === uid ? 1 : 0;
          return [...list.slice(0, mine), guest, ...list.slice(mine)];
        });
        seat(guest.id);
        return true;
      } catch (error) {
        notify.error('Could not add the guest', toUserMessage(error));
        return false;
      }
    },
    [scoringLeagueId, uid, seat],
  );

  const ready = freeForAll
    ? group.length >= groupService.MIN_GROUP_PLAYERS
    : sideA.length === sizeA && sideB.length === sizeB;

  const create = useCallback(async () => {
    if (!scoringLeagueId || !uid || !ready || busy) {
      return;
    }
    setBusy(true);
    try {
      if (format === 'free_for_all') {
        const created = await groupService.createGroupMatch({
          leagueId: scoringLeagueId,
          createdByUid: uid,
          playerIds: group,
          bestOf,
          namedLabel: label.trim() || null,
        });
        router.replace({ pathname: '/group/[id]', params: { id: created.id } });
        return;
      }
      const match = await matchService.createMatch({
        leagueId: scoringLeagueId,
        createdByUid: uid,
        format,
        teamA: sideA,
        teamB: sideB,
        bestOf,
        namedLabel: label.trim() || null,
        crownsChampion: crowns && canCrown,
      });
      router.replace({
        pathname: '/match/[id]',
        params: midway ? { id: match.id, midway: '1' } : { id: match.id },
      });
    } catch (error) {
      notify.error('Could not create the match', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }, [
    scoringLeagueId,
    uid,
    ready,
    busy,
    format,
    group,
    bestOf,
    label,
    sideA,
    sideB,
    crowns,
    canCrown,
    midway,
  ]);

  return {
    players,
    loaded,
    format,
    sideA,
    sideB,
    group,
    bestOf,
    label,
    crowns,
    midway,
    busy,
    freeForAll,
    sizeA,
    sizeB,
    canCrown,
    ready,
    needed: freeForAll ? groupService.MIN_GROUP_PLAYERS : sizeA + sizeB,
    nameOf,
    setBestOf,
    setLabel,
    setCrowns,
    setMidway,
    changeFormat,
    toggle,
    addGuest,
    create,
  };
}
