import { router, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { FlatList, ScrollView, StyleSheet } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { LookingComposeSheet } from '@/features/community/components/LookingComposeSheet';
import { LookingPostCard } from '@/features/community/components/LookingPostCard';
import {
  listLookingPosts,
  LOOKING_KIND_LABEL,
} from '@/features/community/services/looking.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { LookingKind, LookingPost } from '@/shared/types/domain';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HeaderIconButton } from '@/shared/ui/HeaderIconButton';
import { LoadGate } from '@/shared/ui/LoadGate';
import { Screen } from '@/shared/ui/Screen';
import { spacing } from '@/theme/tokens';

const KINDS: Array<LookingKind | 'all'> = ['all', 'opponent', 'player', 'club', 'table'];

/**
 * "Looking" posts in my city: the city is the header title, "+" opens the compose sheet,
 * one chip row filters, and the posts fill the rest.
 */
export function LookingScreen(): ReactNode {
  const { user } = useSession();
  const navigation = useNavigation();
  const [posts, setPosts] = useState<LookingPost[]>([]);
  const [kind, setKind] = useState<LookingKind | 'all'>('all');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [composing, setComposing] = useState(false);

  const cityId = user?.cityId ?? null;
  const cityName = user?.cityName ?? null;

  const reload = useCallback(async () => {
    setPosts(cityId ? await listLookingPosts({ cityId, kind, includeClosed }) : []);
  }, [cityId, kind, includeClosed]);
  const load = useStoreReload(reload, cityId ? `looking:${cityId}:${kind}:${includeClosed}` : null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: cityName ? `Looking · ${cityName}` : 'Looking',
      headerRight: cityId
        ? () => <HeaderIconButton icon="add" label="New post" onPress={() => setComposing(true)} />
        : undefined,
    });
  }, [navigation, cityId, cityName]);

  if (!user) {
    return null;
  }
  if (!cityId || !cityName) {
    return (
      <Screen>
        <EmptyState
          icon="location-outline"
          title="Pick your city first"
          message="Find opponents, players, clubs and tables near you. Posts are shared with players in the same city."
          actionLabel="Choose city"
          onAction={() => router.push('/location')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {KINDS.map((k) => (
          <Chip
            key={k}
            label={k === 'all' ? 'All' : LOOKING_KIND_LABEL[k]}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
        <Chip
          label={includeClosed ? 'With closed' : 'Open only'}
          selected={includeClosed}
          onPress={() => setIncludeClosed((v) => !v)}
        />
      </ScrollView>

      <LoadGate load={load} loadingLabel="Loading posts" errorTitle="Couldn't load posts">
        <FlatList
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <LookingPostCard post={item} myUid={user.uid} />}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No posts here yet"
              message="Be the first: tell local players what you need."
              actionLabel="New post"
              onAction={() => setComposing(true)}
            />
          }
        />
      </LoadGate>

      <LookingComposeSheet
        visible={composing}
        onClose={() => setComposing(false)}
        cityId={cityId}
        cityName={cityName}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterScroll: {
    flexGrow: 0,
    marginBottom: spacing.md,
    marginHorizontal: -spacing.md,
  },
  filterRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
});
