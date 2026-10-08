import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  DASHBOARD_TAB_LABELS,
  dashboardTiles,
  type DashboardTab,
  type DetailKey,
} from '@/features/stats/components/dashboard-tiles';
import type { GridTileData } from '@/features/stats/components/GridTile';
import { PlayerHero } from '@/features/stats/components/PlayerHero';
import { StatDetailSheet } from '@/features/stats/components/StatDetailSheet';
import { StatGrid } from '@/features/stats/components/StatGrid';
import type { LeagueStats } from '@/features/stats/hooks/use-league-stats';
import { useLeagueRecords, usePlayerCard } from '@/features/stats/hooks/use-player-card';
import { useLayout } from '@/shared/hooks/use-layout';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FitContent } from '@/shared/ui/FitContent';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

interface PlayerDashboardProps {
  stats: LeagueStats;
  playerId: string | null;
  /** Tabs to offer; with one tab the tab strip is hidden. */
  tabs: DashboardTab[];
  columns?: 2 | 3;
  subtitle?: string | null;
  onNamePress?: () => void;
  heroRight?: ReactNode;
}

/**
 * One player's numbers on a single screen: who they are, then a tab of tiles that fills
 * the space left. Tiles open detail sheets, rivals open Compare, records open the holder.
 */
export function PlayerDashboard({
  stats,
  playerId,
  tabs,
  columns = 2,
  subtitle,
  onNamePress,
  heroRight,
}: PlayerDashboardProps): ReactNode {
  const palette = usePalette();
  const { short } = useLayout();
  const card = usePlayerCard(stats, playerId);
  const records = useLeagueRecords(stats);
  const [tab, setTab] = useState<DashboardTab>(tabs[0] ?? 'overview');
  const [detail, setDetail] = useState<DetailKey | null>(null);

  if (!card || !playerId) {
    return (
      <EmptyState
        icon="stats-chart-outline"
        title="No stats yet"
        message="Play a match or race in this league to unlock stats."
        actionLabel="Start a match"
        onAction={() => router.push('/match/new')}
      />
    );
  }

  const activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? 'overview');
  const nameOf = (id: string): string => stats.playerById.get(id)?.displayName ?? 'Player';
  const tiles: GridTileData[] = dashboardTiles(activeTab, card, nameOf, records).map((t) => ({
    key: t.key,
    label: t.label,
    value: t.value,
    hint: t.hint,
    accent: palette[t.tone],
    onPress: t.detail
      ? () => setDetail(t.detail ?? null)
      : t.compareWith
        ? () => router.push(`/(main)/compare?a=${playerId}&b=${t.compareWith}`)
        : t.openPlayer
          ? () => router.push(`/(main)/players/${t.openPlayer}`)
          : undefined,
  }));

  return (
    <View style={styles.wrap}>
      <PlayerHero
        name={card.insights.player.displayName}
        subtitle={subtitle}
        rating={card.rating}
        rank={card.rank}
        rankedCount={card.rankedCount}
        onNamePress={onNamePress}
        right={heroRight}
        dense={short}
      />
      {tabs.length > 1 ? (
        <SegmentedTabs
          items={tabs.map((key) => ({ key, label: DASHBOARD_TAB_LABELS[key] }))}
          value={activeTab}
          onChange={setTab}
        />
      ) : null}
      <FitContent>
        <StatGrid tiles={tiles} columns={columns} dense={short} />
      </FitContent>
      <StatDetailSheet detail={detail} card={card} onClose={() => setDetail(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm + 4,
  },
});
