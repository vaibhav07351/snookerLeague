import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { HistoryFilterBar } from '@/features/history/components/HistoryFilterBar';
import { HistoryRow } from '@/features/history/components/HistoryRow';
import { useHistory } from '@/features/history/hooks/use-history';
import { idOf, NO_FILTER } from '@/features/history/services/history.service';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LoadGate } from '@/shared/ui/LoadGate';
import { Screen } from '@/shared/ui/Screen';
import { spacing } from '@/theme/tokens';

/** Every game in the league, newest first, narrowed by format and player. */
export function HistoryScreen(): ReactNode {
  const { league } = useSession();
  const h = useHistory(league?.id);
  if (!league) {
    return null;
  }
  const filtered = h.filter.format !== 'all' || h.filter.playerId !== null;
  const race = h.filter.format === 'race';

  return (
    <Screen scroll={false}>
      <HistoryFilterBar
        filter={h.filter}
        onChange={h.setFilter}
        players={h.players}
        nameOf={h.nameOf}
      />
      <LoadGate load={h.load} loadingLabel="Loading games" errorTitle="Couldn't load your games">
        <FlatList
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          data={h.items}
          keyExtractor={idOf}
          ListFooterComponent={
            h.hasMore ? (
              <Button
                label="Show older games"
                variant="secondary"
                size="sm"
                onPress={h.showOlder}
              />
            ) : null
          }
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                icon="filter-outline"
                title="No games match"
                message={
                  h.hasMore
                    ? 'None in the latest games. Show older games, or change the filter.'
                    : 'Try another format or player.'
                }
                actionLabel="Show all games"
                onAction={() => h.setFilter(NO_FILTER)}
              />
            ) : (
              <EmptyState
                icon="time-outline"
                title="Nothing logged yet"
                message="Finished and live games show up here, newest first."
                actionLabel={race ? 'Start a race' : 'Start a match'}
                onAction={() => router.push(race ? '/race/new' : '/match/new')}
              />
            )
          }
          renderItem={({ item }) => <HistoryRow item={item} nameOf={h.nameOf} />}
        />
      </LoadGate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
});
