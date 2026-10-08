import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { CityBoard } from '@/features/stats/components/CityBoard';
import { LeaderboardRow } from '@/features/stats/components/LeaderboardRow';
import { Podium } from '@/features/stats/components/Podium';
import { useLeaderboard } from '@/features/stats/hooks/use-leaderboard';
import { useLeagueStats } from '@/features/stats/hooks/use-league-stats';
import type {
  BoardKey,
  BoardPeriod,
  BoardRow,
} from '@/features/stats/services/leaderboard.service';
import { PROVISIONAL_GAMES } from '@/features/stats/services/rating.service';
import { useLayout } from '@/shared/hooks/use-layout';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LoadingState } from '@/shared/ui/LoadingState';
import { PagedList } from '@/shared/ui/PagedList';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

type Tab = BoardKey | 'city';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'rating', label: 'Rating' },
  { key: 'wins', label: 'Wins' },
  { key: 'race', label: 'Race' },
  { key: 'breaks', label: 'Breaks' },
  { key: 'city', label: 'City' },
];

const PERIODS: Array<{ key: BoardPeriod; label: string }> = [
  { key: 'all', label: 'All time' },
  { key: '30d', label: 'Last 30 days' },
];

function boardHint(key: BoardKey, period: BoardPeriod): string {
  const recent = period === '30d';
  switch (key) {
    case 'rating':
      return recent
        ? 'Rating gained in the last 30 days · 2 results to qualify'
        : `Beat stronger players to climb · ${PROVISIONAL_GAMES} results to be ranked`;
    case 'wins':
      return `Match win rate · ${recent ? 2 : 3} matches to qualify`;
    case 'race':
      return `Race win rate · ${recent ? 2 : 3} races to qualify`;
    case 'breaks':
      return 'Highest break from the live shot log';
  }
}

export function LeaderboardScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const { short, compact } = useLayout();
  const { league, user } = useSession();
  const stats = useLeagueStats(league?.id, user?.uid);
  const [tab, setTab] = useState<Tab>('rating');
  const [period, setPeriod] = useState<BoardPeriod>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const board = useLeaderboard(stats, tab === 'city' ? 'rating' : tab, period);
  const rowHeight = short ? 50 : 56;

  if (!league) {
    return null;
  }

  function stopSelecting(): void {
    setSelecting(false);
    setSelected([]);
  }

  function onRowPress(playerId: string): void {
    if (!selecting) {
      router.push(`/(main)/players/${playerId}`);
      return;
    }
    if (selected.includes(playerId)) {
      setSelected(selected.filter((id) => id !== playerId));
      return;
    }
    const next = [...selected, playerId];
    if (next.length === 2) {
      stopSelecting();
      router.push(`/(main)/compare?a=${next[0]}&b=${next[1]}`);
      return;
    }
    setSelected(next);
  }

  const podium = board.rows.filter((r) => r.qualified).slice(0, 3);
  const rest = board.rows.slice(podium.length);

  function renderRow(row: BoardRow): ReactNode {
    return (
      <LeaderboardRow
        rank={row.rank}
        name={row.name}
        sub={row.sub}
        value={row.value}
        movement={row.movement}
        isNew={row.isNew}
        form={row.form}
        isMe={row.playerId === stats.meId}
        selecting={selecting}
        selected={selected.includes(row.playerId)}
        compact={compact}
        onPress={() => onRowPress(row.playerId)}
      />
    );
  }

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <SegmentedTabs
          items={TABS}
          value={tab}
          onChange={(key) => {
            setTab(key);
            stopSelecting();
          }}
        />

        {tab === 'city' ? (
          <CityBoard user={user} rowHeight={rowHeight} />
        ) : (
          <>
            <View style={styles.controls}>
              <SegmentedTabs
                size="sm"
                items={PERIODS}
                value={period}
                onChange={setPeriod}
                style={styles.period}
              />
              <Button
                label={selecting ? 'Cancel' : 'Compare'}
                icon={selecting ? 'close' : 'git-compare-outline'}
                size="sm"
                variant={selecting ? 'ghost' : 'secondary'}
                disabled={stats.players.length < 2}
                onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
              />
            </View>
            <Text style={[styles.hint, selecting && styles.hintOn]} numberOfLines={1}>
              {selecting
                ? `Tap 2 players to compare (${selected.length}/2)`
                : boardHint(tab, period)}
            </Text>

            {!stats.ready ? (
              <LoadingState label="Loading rankings" />
            ) : stats.players.length === 0 ? (
              <EmptyState
                icon="podium-outline"
                title="No players yet"
                message="Add players and log a match or race to start the rankings."
                actionLabel="Add players"
                onAction={() => router.push('/(main)/players')}
              />
            ) : (
              <>
                {podium.length > 0 ? (
                  <Podium
                    rows={podium}
                    meId={stats.meId}
                    selectedIds={selected}
                    selecting={selecting}
                    dense={short}
                    onPress={(row) => onRowPress(row.playerId)}
                  />
                ) : null}
                <PagedList
                  items={rest}
                  rowHeight={rowHeight}
                  resetKey={`${tab}:${period}`}
                  noun={podium.length > 0 ? 'more' : 'players'}
                  keyExtractor={(row) => row.playerId}
                  renderItem={renderRow}
                  empty={
                    <Text style={styles.allShown}>
                      {podium.length > 0
                        ? 'Everyone is on the podium.'
                        : 'Log a match or race to start the rankings.'}
                    </Text>
                  }
                  pinnedKey={stats.meId}
                />
              </>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minHeight: 0,
      gap: spacing.sm,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    period: {
      flex: 1,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    hintOn: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
    },
    allShown: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
  });
