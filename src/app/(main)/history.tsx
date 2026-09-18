import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Match, Player, Race } from '@/shared/types/domain';
import { formatDateTimeSubtle } from '@/shared/utils/datetime';
import { colors, fonts, spacing, typography } from '@/theme/tokens';

type Filter = 'all' | 'match' | 'race';
type HistoryItem =
  | { kind: 'match'; at: string; match: Match }
  | { kind: 'race'; at: string; race: Race };

export default function HistoryScreen(): ReactNode {
  const { league } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!league) {
      return;
    }
    const [matches, races, roster] = await Promise.all([
      matchService.listMatches(league.id, { limit: 50 }),
      raceService.listRaces(league.id, { limit: 50 }),
      playersService.listPlayers(league.id),
    ]);
    setPlayers(roster);
    const combined: HistoryItem[] = [
      ...matches.map((match) => ({ kind: 'match' as const, at: match.updatedAt, match })),
      ...races.map((race) => ({ kind: 'race' as const, at: race.updatedAt, race })),
    ]
      .filter((row) => filter === 'all' || row.kind === filter)
      .sort((a, b) => b.at.localeCompare(a.at));
    setItems(combined);
  }, [league, filter]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  const nameOf = (id: string): string =>
    players.find((p) => p.id === id)?.displayName ?? 'Player';

  if (!league) {
    return null;
  }

  return (
    <Screen scroll={false}>
      <View style={styles.tabs}>
        {(['all', 'match', 'race'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.tab, filter === f && styles.tabOn]}
          >
            <Text style={[styles.tabText, filter === f && styles.tabTextOn]}>
              {f === 'all' ? 'All' : f === 'match' ? 'Matches' : 'Races'}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'match' ? item.match.id : item.race.id)}
        ListEmptyComponent={<Text style={typography.subtitle}>Nothing logged yet.</Text>}
        renderItem={({ item }) => {
          const when = formatDateTimeSubtle(item.at);
          if (item.kind === 'match') {
            const m = item.match;
            const labels = matchService.playerNamesForMatch(m, nameOf);
            const score =
              m.outcome.status === 'in_progress'
                ? `${m.outcome.framesA}–${m.outcome.framesB} live`
                : m.outcome.status === 'forfeited'
                  ? (() => {
                      const f = m.outcome.scoreAtForfeit;
                      const pts =
                        (f.framePointsA ?? 0) > 0 || (f.framePointsB ?? 0) > 0
                          ? ` · pts ${f.framePointsA ?? 0}–${f.framePointsB ?? 0}`
                          : '';
                      return `${f.framesA}–${f.framesB}${pts}`;
                    })()
                  : `${m.outcome.framesA}–${m.outcome.framesB}`;
            const forfeitLine = matchService.describeForfeit(m, nameOf);
            return (
              <Pressable style={styles.row} onPress={() => router.push(`/match/${m.id}`)}>
                <View style={styles.kindRow}>
                  <Text style={styles.kind}>
                    {m.outcome.status === 'forfeited' ? 'FORFEIT' : 'MATCH'}
                  </Text>
                  {when ? <Text style={styles.when}>{when}</Text> : null}
                </View>
                <Text style={styles.title}>
                  {m.namedLabel ?? `${labels.teamA} vs ${labels.teamB}`}
                </Text>
                <Text style={styles.meta}>{forfeitLine ?? score}</Text>
              </Pressable>
            );
          }
          const r = item.race;
          const winner = r.entrants.find((e) => e.place === 1);
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/race/${r.id}`)}>
              <View style={styles.kindRow}>
                <Text style={styles.kind}>RACE</Text>
                {when ? <Text style={styles.when}>{when}</Text> : null}
              </View>
              <Text style={styles.title}>{r.namedLabel ?? `Race to ${r.targetScore}`}</Text>
              <Text style={styles.meta}>
                {r.status === 'completed'
                  ? `1st: ${winner ? nameOf(winner.playerId) : '—'}`
                  : 'In progress'}
              </Text>
            </Pressable>
          );
        }}
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
    paddingVertical: spacing.sm,
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
    fontSize: 13,
  },
  tabTextOn: {
    color: colors.felt,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  kind: {
    color: colors.goldSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  when: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 11,
    opacity: 0.85,
  },
  title: {
    color: colors.chalk,
    fontWeight: '700',
    fontSize: 16,
  },
  meta: {
    color: colors.chalkMuted,
    fontSize: 13,
  },
});
