import { useCallback, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  frameLeaders,
  groupStandings,
  replayGroupFrame,
  type GroupStandingRow,
  type PointsByPlayer,
} from '@/features/group/services/group-frame-engine';
import * as groupLive from '@/features/group/services/group-live.service';
import * as groupService from '@/features/group/services/group.service';
import { tableStateFromShots, type TableState } from '@/features/match/services/table-state';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload, type StoreLoad } from '@/shared/hooks/use-store-reload';
import type { BallValue, GroupMatch, Player } from '@/shared/types/domain';
import { notify } from '@/shared/ui/notify';
import { shortNames } from '@/shared/utils/names';

export interface GroupLiveFrame {
  points: PointsByPlayer;
  /** Foul value each player has given away this frame. */
  foulPoints: PointsByPlayer;
  currentBreak: number;
  table: TableState;
  /** Players sharing the top score right now. */
  leaders: string[];
  atTablePlayerId: string;
  /** Points the player at the table trails the leader by. */
  deficit: number;
}

export interface GroupMatchScreenState {
  /** undefined while loading, null when the match does not exist (or was deleted). */
  group: GroupMatch | null | undefined;
  /** First load status: an error shows Retry instead of spinning forever. */
  load: StoreLoad;
  fullName: (playerId: string) => string;
  shortName: (playerId: string) => string;
  standings: GroupStandingRow[];
  /** The frame being scored, or null once the match is over. */
  live: GroupLiveFrame | null;
  canManage: boolean;
  busy: boolean;
  actions: {
    pot: (ball: BallValue) => void;
    foul: (points: number) => void;
    endVisit: (kind: 'miss' | 'safety') => void;
    freeBall: () => void;
    selectPlayer: (playerId: string) => void;
    undo: () => Promise<boolean>;
    endFrame: (winnerId: string) => Promise<boolean>;
    remove: () => Promise<boolean>;
  };
}

function liveFrameOf(group: GroupMatch): GroupLiveFrame | null {
  const open = group.openFrame;
  if (group.status !== 'in_progress' || !open) {
    return null;
  }
  const score = replayGroupFrame(open.shots, group.playerIds);
  const top = Math.max(0, ...Object.values(score.points));
  const mine = score.points[open.atTablePlayerId] ?? 0;
  return {
    points: score.points,
    foulPoints: score.foulPoints,
    currentBreak: score.breakPlayerId === open.atTablePlayerId ? score.currentBreak : 0,
    table: tableStateFromShots(open.shots),
    leaders: frameLeaders(score.points),
    atTablePlayerId: open.atTablePlayerId,
    deficit: Math.max(0, top - mine),
  };
}

export function useGroupMatch(groupId: string | undefined): GroupMatchScreenState {
  const { user } = useSession();
  const [group, setGroup] = useState<GroupMatch | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!groupId) {
      setGroup(null);
      return;
    }
    const g = await groupService.getGroupMatch(groupId);
    setGroup((prev) => (prev === g ? prev : g));
    if (g) {
      setPlayers(await playersService.listPlayers(g.leagueId));
    }
  }, [groupId]);

  const load = useStoreReload(reload, groupId ?? null);

  const derived = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    const fullName = (id: string): string => byId.get(id) ?? 'Player';
    const shorts = shortNames((group?.playerIds ?? []).map((id) => ({ id, name: fullName(id) })));
    const shortName = (id: string): string => shorts[id] ?? fullName(id);
    return {
      fullName,
      shortName,
      standings: group ? groupStandings(group.frames, group.playerIds) : [],
      live: group ? liveFrameOf(group) : null,
      canManage: group ? groupService.canManageGroupMatch(group, user?.uid) : false,
    };
  }, [group, players, user?.uid]);

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

  const id = group?.id;
  const actions = useMemo(() => {
    // Shot taps are fire-and-forget so rapid taps never wait on each other; writes are
    // serialized per match in the service, so order is preserved.
    const shot = (label: string, fn: (gid: string) => Promise<unknown>): void => {
      if (!id) {
        return;
      }
      fn(id).catch((error: unknown) => notify.error(label, toUserMessage(error)));
    };
    const guarded = (label: string, fn: (gid: string) => Promise<unknown>): Promise<boolean> =>
      id ? run(label, () => fn(id)) : Promise.resolve(false);
    return {
      pot: (ball: BallValue) =>
        shot('Could not record pot', (gid) => groupLive.recordShot(gid, { kind: 'pot', ball })),
      foul: (points: number) =>
        shot('Could not record foul', (gid) => groupLive.recordShot(gid, { kind: 'foul', points })),
      endVisit: (kind: 'miss' | 'safety') =>
        shot('Could not end visit', (gid) => groupLive.recordShot(gid, { kind })),
      freeBall: () =>
        shot('Could not record free ball', (gid) =>
          groupLive.recordShot(gid, { kind: 'free_ball' }),
        ),
      selectPlayer: (playerId: string) =>
        shot('Could not change player', (gid) => groupLive.setAtTablePlayer(gid, playerId)),
      undo: () => guarded('Could not undo', (gid) => groupLive.undoLast(gid)),
      endFrame: (winnerId: string) =>
        guarded('Could not end the frame', (gid) => groupLive.endFrame(gid, winnerId)),
      remove: () =>
        guarded('Could not delete the match', (gid) => groupService.deleteGroupMatch(gid)),
    };
  }, [id, run]);

  return { group, load, busy, actions, ...derived };
}
