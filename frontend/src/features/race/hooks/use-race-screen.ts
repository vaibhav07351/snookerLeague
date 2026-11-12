import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import * as playersService from '@/features/players/services/players.service';
import { withRaceDefaults } from '@/features/race/services/race-helpers';
import * as raceAdmin from '@/features/race/services/race-admin.service';
import * as raceLive from '@/features/race/services/race-live.service';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload, type StoreLoad } from '@/shared/hooks/use-store-reload';
import type { BallValue, Player, Race } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';
import { shortNames } from '@/shared/utils/names';

export interface RaceScreenState {
  /** undefined while loading, null when the race is not on this phone. */
  race: Race | null | undefined;
  load: StoreLoad;
  nameOf: (playerId: string) => string;
  /** First names, surnames only when first names clash (live board and pad are tight). */
  shortNameOf: (playerId: string) => string;
  canManage: boolean;
  /** Player whose Out / Undo is being saved. */
  busyPlayerId: string | null;
  deleting: boolean;
  live: {
    pot: (ball: BallValue) => void;
    foul: (points: number) => void;
    miss: () => void;
    safety: () => void;
    undo: () => void;
    selectPlayer: (playerId: string) => void;
  };
  setScore: (playerId: string, score: number) => Promise<void>;
  markDidntFinish: (playerId: string) => Promise<void>;
  undoDidntFinish: (playerId: string) => Promise<void>;
  complete: () => Promise<void>;
  remove: () => Promise<void>;
}

/** Loads a race and its players, and holds the race screen's actions. */
export function useRaceScreen(raceId: string | undefined): RaceScreenState {
  const { user } = useSession();
  const [race, setRace] = useState<Race | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    if (!raceId) {
      setRace(null);
      return;
    }
    const r = await raceService.getRace(raceId);
    setRace((prev) => {
      if (prev && r && prev.id === r.id && prev.updatedAt === r.updatedAt) {
        return prev;
      }
      return r ? withRaceDefaults(r) : null;
    });
    if (r) {
      setPlayers(await playersService.listPlayers(r.leagueId));
    }
  }, [raceId]);
  const load = useStoreReload(reload, raceId ?? null);

  const names = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    const nameOf = (pid: string): string => byId.get(pid) ?? 'Player';
    const compact = shortNames(
      (race?.entrants ?? []).map((e) => ({ id: e.playerId, name: nameOf(e.playerId) })),
    );
    return { nameOf, shortNameOf: (pid: string): string => compact[pid] ?? nameOf(pid) };
  }, [players, race?.entrants]);

  const id = race?.id;
  const inProgress = race?.status === 'in_progress';
  const { nameOf } = names;

  const live = useMemo(() => {
    const fail = (error: unknown): void => notify.error('Could not record', toUserMessage(error));
    const send = (fn: (rid: string) => Promise<unknown>): void => {
      if (id) {
        fn(id).catch(fail);
      }
    };
    return {
      pot: (ball: BallValue) => send((rid) => raceLive.recordPot(rid, ball)),
      foul: (points: number) => send((rid) => raceLive.recordFoul(rid, points)),
      miss: () => send((rid) => raceLive.recordMiss(rid)),
      safety: () => send((rid) => raceLive.recordSafety(rid)),
      undo: () => send((rid) => raceLive.undoLast(rid)),
      selectPlayer: (playerId: string) => send((rid) => raceLive.setAtTablePlayer(rid, playerId)),
    };
  }, [id]);

  const withPlayerBusy = useCallback(
    async (playerId: string, label: string, action: () => Promise<unknown>): Promise<void> => {
      setBusyPlayerId(playerId);
      try {
        await action();
      } catch (error) {
        notify.error(label, toUserMessage(error));
      } finally {
        setBusyPlayerId(null);
      }
    },
    [],
  );

  const setScore = useCallback(
    async (playerId: string, score: number): Promise<void> => {
      if (!id) {
        return;
      }
      try {
        await raceService.setEntrantScore(id, playerId, score);
      } catch (error) {
        notify.error('Could not update score', toUserMessage(error));
      }
    },
    [id],
  );

  const markDidntFinish = useCallback(
    async (playerId: string): Promise<void> => {
      if (!id) {
        return;
      }
      const ok = await confirmAction(
        "Mark as didn't finish?",
        `${nameOf(playerId)} drops out and takes last place, which still counts in ratings. You can undo while the race is still in progress.`,
        "Didn't finish",
        { tone: 'danger' },
      );
      if (ok) {
        await withPlayerBusy(playerId, "Could not mark didn't finish", () =>
          raceService.markDnf(id, playerId),
        );
      }
    },
    [id, nameOf, withPlayerBusy],
  );

  const undoDidntFinish = useCallback(
    async (playerId: string): Promise<void> => {
      if (id) {
        await withPlayerBusy(playerId, 'Could not undo', () => raceService.undoDnf(id, playerId));
      }
    },
    [id, withPlayerBusy],
  );

  // The button is pinned on screen the whole race, so a stray tap must not end it.
  const complete = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    const ok = await confirmAction(
      'Complete the race?',
      'Players still playing are placed by score after fouls. If level, fewer fouls goes ahead.',
      'Complete race',
    );
    if (!ok) {
      return;
    }
    try {
      await raceService.completeRace(id);
    } catch (error) {
      notify.error('Could not complete', toUserMessage(error));
    }
  }, [id]);

  const remove = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    const ok = await confirmAction(
      inProgress ? 'Abandon and delete this race?' : 'Delete this race?',
      'It is removed for everyone, and stats and the race king are worked out again without it. This cannot be undone.',
      'Delete',
    );
    if (!ok) {
      return;
    }
    setDeleting(true);
    try {
      await raceAdmin.deleteRace(id);
      router.replace('/');
    } catch (error) {
      notify.error('Could not delete the race', toUserMessage(error));
      setDeleting(false);
    }
  }, [id, inProgress]);

  return {
    race,
    load,
    ...names,
    canManage: race ? raceAdmin.canManageRace(race, user?.uid) : false,
    busyPlayerId,
    deleting,
    live,
    setScore,
    markDidntFinish,
    undoDidntFinish,
    complete,
    remove,
  };
}
