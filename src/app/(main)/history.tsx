import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Match, Player, Race } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { formatDateTimeSubtle } from '@/shared/utils/datetime';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

type Filter = 'all' | 'match' | 'race';
type HistoryItem =
  { kind: 'match'; at: string; match: Match } | { kind: 'race'; at: string; race: Race };

const FILTERS: Filter[] = ['all', 'match', 'race'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', match: 'Matches', race: 'Races' };

const PAGE = 50;

export default function HistoryScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const { league } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pageSize, setPageSize] = useState(PAGE);
  const [hasMore, setHasMore] = useState(false);

  const leagueId = league?.id;

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    const [matches, races, roster] = await Promise.all([
      matchService.listMatches(leagueId, { limit: pageSize }),
      raceService.listRaces(leagueId, { limit: pageSize }),
      playersService.listPlayers(leagueId),
    ]);
    setPlayers(roster);
    setHasMore(matches.length === pageSize || races.length === pageSize);
    const combined: HistoryItem[] = [
      ...matches.map((match) => ({ kind: 'match' as const, at: match.updatedAt, match })),
      ...races.map((race) => ({ kind: 'race' as const, at: race.updatedAt, race })),
    ]
      .filter((row) => filter === 'all' || row.kind === filter)
      .sort((a, b) => b.at.localeCompare(a.at));
    setItems(combined);
  }, [leagueId, filter, pageSize]);

  useStoreReload(reload, leagueId ? `${leagueId}:${filter}:${pageSize}` : null);

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? 'Player';

  if (!league) {
    return null;
  }

  const emptyTitle =
    filter === 'race'
      ? 'No races yet'
      : filter === 'match'
        ? 'No matches yet'
        : 'Nothing logged yet';

  return (
    <Screen scroll={false}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {FILTER_LABEL[f]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => (item.kind === 'match' ? item.match.id : item.race.id)}
        ListFooterComponent={
          hasMore ? (
            <Button
              label="Show older games"
              variant="secondary"
              size="sm"
              onPress={() => setPageSize((n) => n + PAGE)}
            />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title={emptyTitle}
            message="Finished and live games show up here, newest first."
            actionLabel={filter === 'race' ? 'Start a race' : 'Start a match'}
            onAction={() => router.push(filter === 'race' ? '/race/new' : '/match/new')}
          />
        }
        renderItem={({ item }) => {
          const when = formatDateTimeSubtle(item.at);
          if (item.kind === 'match') {
            const m = item.match;
            const labels = matchService.playerNamesForMatch(m, nameOf);
            const score =
              m.outcome.status === 'in_progress'
                ? `${m.outcome.framesA}-${m.outcome.framesB} live`
                : m.outcome.status === 'forfeited'
                  ? (() => {
                      const f = m.outcome.scoreAtForfeit;
                      const pts =
                        (f.framePointsA ?? 0) > 0 || (f.framePointsB ?? 0) > 0
                          ? ` · pts ${f.framePointsA ?? 0}-${f.framePointsB ?? 0}`
                          : '';
                      return `${f.framesA}-${f.framesB}${pts}`;
                    })()
                  : `${m.outcome.framesA}-${m.outcome.framesB}`;
            const forfeitLine = matchService.describeForfeit(m, nameOf);
            const forfeited = m.outcome.status === 'forfeited';
            const live = m.outcome.status === 'in_progress';
            return (
              <Card style={styles.row} onPress={() => router.push(`/match/${m.id}`)}>
                <View style={styles.kindRow}>
                  <Text
                    style={[styles.kind, forfeited && styles.kindDanger, live && styles.kindLive]}
                  >
                    {forfeited ? 'FORFEIT' : live ? 'LIVE MATCH' : 'MATCH'}
                  </Text>
                  {when ? <Text style={styles.when}>{when}</Text> : null}
                </View>
                <Text style={styles.title} numberOfLines={2}>
                  {m.namedLabel ?? `${labels.teamA} vs ${labels.teamB}`}
                </Text>
                <Text style={styles.meta}>{forfeitLine ?? score}</Text>
              </Card>
            );
          }
          const r = item.race;
          const winner = r.entrants.find((e) => e.place === 1);
          const done = r.status === 'completed';
          return (
            <Card style={styles.row} onPress={() => router.push(`/race/${r.id}`)}>
              <View style={styles.kindRow}>
                <Text style={[styles.kind, styles.kindRace, !done && styles.kindLive]}>
                  {done ? 'RACE' : 'LIVE RACE'}
                </Text>
                {when ? <Text style={styles.when}>{when}</Text> : null}
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {r.namedLabel ?? `Race to ${r.targetScore}`}
              </Text>
              <Text style={styles.meta}>
                {done ? `1st: ${winner ? nameOf(winner.playerId) : '-'}` : 'In progress'}
              </Text>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      marginBottom: spacing.md,
      borderRadius: radii.sm,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      minHeight: TOUCH_TARGET - spacing.xs,
      paddingHorizontal: spacing.xs,
      borderRadius: radii.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabOn: {
      backgroundColor: c.primary,
    },
    pressed: {
      opacity: 0.85,
    },
    tabText: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 14,
    },
    tabTextOn: {
      color: c.onPrimary,
    },
    listFlex: {
      flex: 1,
    },
    list: {
      gap: spacing.sm,
      paddingBottom: spacing.xl,
    },
    row: {
      gap: 2,
    },
    kindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    kind: {
      fontFamily: fonts.bodyBold,
      color: c.teamA,
      fontSize: 11,
      letterSpacing: 1,
    },
    kindRace: {
      color: c.accent,
    },
    kindDanger: {
      color: c.danger,
    },
    kindLive: {
      color: c.live,
    },
    when: {
      flexShrink: 1,
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 11,
      textAlign: 'right',
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
    },
  });
