import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
import {
  sortRaceLeaderboard,
  sortStandardLeaderboard,
} from '@/features/stats/services/stats.service';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { colors, spacing, typography } from '@/theme/tokens';

type Tab = 'standard' | 'race';

export default function LeaderboardScreen(): ReactNode {
  const { league } = useSession();
  const [tab, setTab] = useState<Tab>('standard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!league) {
      return;
    }
    const list = await playersService.listPlayers(league.id);
    setPlayers(
      tab === 'standard' ? sortStandardLeaderboard(list) : sortRaceLeaderboard(list),
    );
  }, [league, tab]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  if (!league) {
    return null;
  }

  return (
    <Screen scroll={false}>
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('standard')}
          style={[styles.tab, tab === 'standard' && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === 'standard' && styles.tabTextOn]}>Doubles</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('race')}
          style={[styles.tab, tab === 'race' && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === 'race' && styles.tabTextOn]}>Race</Text>
        </Pressable>
      </View>

      <FlatList
        data={players}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={
          <Text style={typography.subtitle}>No results yet — log a match or race.</Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{index + 1}</Text>
            <View style={styles.mid}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.meta}>
                {tab === 'standard'
                  ? `${item.stats.standard.wins}W / ${item.stats.standard.played} · ${item.stats.standard.winPct}%`
                  : `${item.stats.race.firsts}×1st · avg ${item.stats.race.avgPlace ?? '—'} · ${item.stats.race.firstPct}%`}
              </Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: {
    color: colors.chalk,
    fontWeight: '700',
  },
  tabTextOn: {
    color: colors.felt,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rank: {
    width: 28,
    color: colors.goldSoft,
    fontWeight: '800',
    fontSize: 18,
  },
  mid: {
    flex: 1,
  },
  name: {
    color: colors.chalk,
    fontWeight: '700',
    fontSize: 16,
  },
  meta: {
    color: colors.chalkMuted,
    marginTop: 2,
    fontSize: 13,
  },
});
