import { useCallback, useMemo, useState } from 'react';

import {
  loadHistory,
  NO_FILTER,
  type HistoryFilter,
  type HistoryItem,
} from '@/features/history/services/history.service';
import * as playersService from '@/features/players/services/players.service';
import { useStoreReload, type StoreLoad } from '@/shared/hooks/use-store-reload';
import type { Player } from '@/shared/types/domain';

const PAGE = 50;

export interface HistoryState {
  items: HistoryItem[];
  players: Player[];
  nameOf: (playerId: string) => string;
  filter: HistoryFilter;
  setFilter: (filter: HistoryFilter) => void;
  hasMore: boolean;
  showOlder: () => void;
  load: StoreLoad;
}

/** The league's game history with its format and player filters and "show older" paging. */
export function useHistory(leagueId: string | undefined): HistoryState {
  const [filter, setFilterState] = useState<HistoryFilter>(NO_FILTER);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    const [page, roster] = await Promise.all([
      loadHistory(leagueId, pageSize, filter),
      playersService.listPlayers(leagueId),
    ]);
    setPlayers(roster);
    setItems(page.items);
    setHasMore(page.hasMore);
  }, [leagueId, filter, pageSize]);

  // A new filter shows the spinner again; a bigger page keeps the list on screen.
  const load = useStoreReload(
    reload,
    leagueId ? `${leagueId}:${filter.format}:${filter.playerId ?? ''}` : null,
    pageSize,
  );

  const nameOf = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    return (id: string): string => byId.get(id) ?? 'Player';
  }, [players]);

  const setFilter = useCallback((next: HistoryFilter) => {
    setPageSize(PAGE);
    setFilterState(next);
  }, []);

  return {
    items,
    players,
    nameOf,
    filter,
    setFilter,
    hasMore,
    showOlder: () => setPageSize((n) => n + PAGE),
    load,
  };
}
