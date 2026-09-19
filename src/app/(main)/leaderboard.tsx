import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { divisionLabel, SNOOKER_DIVISIONS } from '@/features/auth/services/division.service';
import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import * as cityHubService from '@/features/league/services/city-hub.service';
import * as profileService from '@/features/community/services/profile.service';
import * as playersService from '@/features/players/services/players.service';
import {
  sortRaceLeaderboard,
  sortStandardLeaderboard,
} from '@/features/stats/services/stats.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { router } from 'expo-router';
import type { Player, PlayerProfile, SnookerDivision } from '@/shared/types/domain';
import { colors, spacing, typography } from '@/theme/tokens';

type Tab = 'standard' | 'race' | 'city';
type DivisionFilter = 'all' | SnookerDivision;

export default function LeaderboardScreen(): ReactNode {
  const { league, user } = useSession();
  const [tab, setTab] = useState<Tab>('standard');
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [cityProfiles, setCityProfiles] = useState<PlayerProfile[]>([]);

  const leagueId = league?.id;

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    if (tab === 'city') {
      const hub = user ? await cityHubService.getCityHubForUser(user.uid) : null;
      if (hub) {
        setCityProfiles(profileService.cityHubPlayersForRank(hub.id));
      } else if (user?.cityId) {
        const page = await profileService.listCityProfiles({ cityId: user.cityId });
        setCityProfiles(page.items);
      } else {
        setCityProfiles([]);
      }
      return;
    }
    const list = await playersService.listPlayers(leagueId);
    setPlayers(tab === 'standard' ? sortStandardLeaderboard(list) : sortRaceLeaderboard(list));
  }, [leagueId, tab, user]);

  useStoreReload(reload, leagueId ? `${leagueId}:${tab}` : null);

  if (!league) {
    return null;
  }

  const cityRows =
    divisionFilter === 'all'
      ? cityProfiles
      : cityProfiles.filter((p) => p.division === divisionFilter);

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
        <Pressable
          onPress={() => setTab('city')}
          style={[styles.tab, tab === 'city' && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === 'city' && styles.tabTextOn]}>City</Text>
        </Pressable>
      </View>

      {tab === 'city' ? (
        <>
          <View style={styles.divs}>
            <Pressable
              onPress={() => setDivisionFilter('all')}
              style={[styles.divChip, divisionFilter === 'all' && styles.divChipOn]}
            >
              <Text style={[styles.divText, divisionFilter === 'all' && styles.divTextOn]}>
                All
              </Text>
            </Pressable>
            {SNOOKER_DIVISIONS.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDivisionFilter(d)}
                style={[styles.divChip, divisionFilter === d && styles.divChipOn]}
              >
                <Text style={[styles.divText, divisionFilter === d && styles.divTextOn]}>
                  {divisionLabel(d)}
                </Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={cityRows}
            keyExtractor={(item) => item.uid}
            ListEmptyComponent={
              <Text style={typography.subtitle}>No city results yet — play in your city hub.</Text>
            }
            renderItem={({ item, index }) => (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/(main)/city-player?uid=${item.uid}`)}
              >
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.mid}>
                  <Text style={styles.name}>{item.displayName}</Text>
                  <Text style={styles.meta}>
                    {divisionLabel(item.division)} · {item.winPct}% · {item.played} games · HB{' '}
                    {item.highestBreak || '—'}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        </>
      ) : (
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
      )}
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
  divs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  divChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  divChipOn: {
    backgroundColor: colors.surfaceBright,
    borderColor: colors.gold,
  },
  divText: {
    color: colors.chalkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  divTextOn: {
    color: colors.goldSoft,
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
