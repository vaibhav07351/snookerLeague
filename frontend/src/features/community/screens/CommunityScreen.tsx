import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { CityPlayerRow } from '@/features/community/components/CityPlayerRow';
import { CommunityListHeader } from '@/features/community/components/CommunityListHeader';
import { useCityCommunity } from '@/features/community/hooks/use-city-community';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LoadingState } from '@/shared/ui/LoadingState';
import { Screen } from '@/shared/ui/Screen';
import { spacing } from '@/theme/tokens';

/**
 * My city: the city is the header title; directories, the best player, live matches and
 * challenges sit above a list of the city's players.
 */
export function CommunityScreen(): ReactNode {
  const { user } = useSession();
  const navigation = useNavigation();
  const uid = user?.uid ?? null;
  const cityId = user?.cityId ?? null;
  const cityName = user?.cityName ?? null;
  const c = useCityCommunity(uid, cityId);

  useLayoutEffect(() => {
    navigation.setOptions({ headerTitle: cityName ? `Community · ${cityName}` : 'Community' });
  }, [navigation, cityName]);

  if (!user) {
    return null;
  }
  if (user.isDemo && !cityId) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Sign in to join the community"
          message="Sign in with Google to see players in your city, live matches, and challenges."
        />
      </Screen>
    );
  }
  if (!cityId || !cityName) {
    return (
      <Screen>
        <EmptyState
          icon="location-outline"
          title="Pick your city"
          message="Choose your city to see local players, live matches and challenges."
          actionLabel="Choose city"
          onAction={() => router.push('/location')}
        />
      </Screen>
    );
  }

  const emptyOrState =
    c.load.status === 'loading' ? (
      <LoadingState label="Loading players" />
    ) : c.load.status === 'error' ? (
      <ErrorState title="Couldn't load your city" onRetry={c.load.retry} />
    ) : (
      <EmptyState
        icon="people-outline"
        title="No players here yet"
        message="Play a match in your city hub to put yourself on the map."
      />
    );

  return (
    <Screen scroll={false}>
      <FlatList
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        // Rows only while loaded: loading and errors show in place of the list.
        data={c.load.status === 'ready' ? c.profiles : []}
        keyExtractor={(p) => p.uid}
        renderItem={({ item }) => <CityPlayerRow profile={item} />}
        ListHeaderComponent={
          <CommunityListHeader
            cityName={cityName}
            myUid={user.uid}
            best={c.best}
            live={c.live}
            challenges={c.challenges}
            onAccept={(id) => void c.accept(id)}
            onSetStatus={(id, status) => void c.setStatus(id, status)}
          />
        }
        ListEmptyComponent={emptyOrState}
        ListFooterComponent={
          c.hasMore && c.load.status === 'ready' ? (
            <Button
              label="Load more"
              variant="secondary"
              loading={c.loadingMore}
              onPress={() => void c.loadMore()}
              style={styles.loadMore}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listFlex: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  loadMore: {
    marginTop: spacing.md,
  },
});
