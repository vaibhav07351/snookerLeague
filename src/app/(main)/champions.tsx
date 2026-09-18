import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import {
  listRaceChampionHistory,
  listTeamChampionHistory,
  type RaceChampionRecord,
  type TeamChampionRecord,
} from '@/features/league/services/champions.service';
import * as playersService from '@/features/players/services/players.service';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { formatDateTimeSubtle } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

type ChampTab = 'match' | 'race';

export default function ChampionsHistoryScreen(): ReactNode {
  const { league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamChampionRecord[]>([]);
  const [races, setRaces] = useState<RaceChampionRecord[]>([]);
  const [tab, setTab] = useState<ChampTab>('match');
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!league) {
      return;
    }
    const [roster, teamHistory, raceHistory] = await Promise.all([
      playersService.listPlayers(league.id),
      listTeamChampionHistory(league.id),
      listRaceChampionHistory(league.id),
    ]);
    setPlayers(roster);
    setTeams(teamHistory);
    setRaces(raceHistory);
  }, [league]);

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

  const nameOf = (id: string): string =>
    players.find((p) => p.id === id)?.displayName ?? 'Player';

  return (
    <Screen>
      <Text style={typography.subtitle}>
        Crowning match titles and race kings — newest first.
      </Text>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setTab('match')}
          style={[styles.tab, tab === 'match' && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === 'match' && styles.tabTextOn]}>
            Match ({teams.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab('race')}
          style={[styles.tab, tab === 'race' && styles.tabOn]}
        >
          <Text style={[styles.tabText, tab === 'race' && styles.tabTextOn]}>
            Race ({races.length})
          </Text>
        </Pressable>
      </View>

      {tab === 'match' ? (
        teams.length === 0 ? (
          <Text style={styles.empty}>
            No title matches yet. Turn on “Crowns champions” when you log a final.
          </Text>
        ) : (
          teams.map((row) => (
            <Pressable
              key={row.matchId}
              style={[styles.card, row.isCurrent && styles.cardCurrent]}
              onPress={() => router.push(`/match/${row.matchId}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.kind}>
                  {row.isCurrent ? 'CURRENT' : row.format === 'singles' ? 'SINGLES' : 'DOUBLES'}
                  {row.viaForfeit ? ' · FORFEIT' : ''}
                </Text>
                <Text style={styles.when}>{formatDateTimeSubtle(row.crownedAt)}</Text>
              </View>
              <Text style={styles.names}>
                {row.playerIds.map((id) => nameOf(id)).join(' & ')}
              </Text>
              <Text style={styles.meta}>
                {row.namedLabel ? `${row.namedLabel} · ` : ''}
                {row.scoreLine}
              </Text>
            </Pressable>
          ))
        )
      ) : races.length === 0 ? (
        <Text style={styles.empty}>
          No race kings yet. Crown a race-to-score when you finish one.
        </Text>
      ) : (
        races.map((row) => (
          <Pressable
            key={row.raceId}
            style={[styles.card, row.isCurrent && styles.cardCurrent]}
            onPress={() => router.push(`/race/${row.raceId}`)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.kind}>{row.isCurrent ? 'CURRENT KING' : 'RACE'}</Text>
              <Text style={styles.when}>{formatDateTimeSubtle(row.crownedAt)}</Text>
            </View>
            <Text style={styles.names}>{nameOf(row.playerId)}</Text>
            <Text style={styles.meta}>
              {row.namedLabel ? `${row.namedLabel} · ` : ''}
              Race to {row.targetScore}
            </Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 14,
  },
  tabTextOn: {
    color: colors.felt,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: 4,
  },
  cardCurrent: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBright,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kind: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.goldSoft,
  },
  when: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.chalkMuted,
  },
  names: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.chalk,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
  },
});
