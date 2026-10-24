import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
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
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { formatDateTimeSubtle } from '@/shared/utils/datetime';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

type ChampTab = 'match' | 'race';

export default function ChampionsHistoryScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const { league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamChampionRecord[]>([]);
  const [races, setRaces] = useState<RaceChampionRecord[]>([]);
  const [tab, setTab] = useState<ChampTab>('match');

  const leagueId = league?.id;

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    const [roster, teamHistory, raceHistory] = await Promise.all([
      playersService.listPlayers(leagueId),
      listTeamChampionHistory(leagueId),
      listRaceChampionHistory(leagueId),
    ]);
    setPlayers(roster);
    setTeams(teamHistory);
    setRaces(raceHistory);
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  if (!league) {
    return null;
  }

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? 'Player';

  const tabs: Array<{ key: ChampTab; label: string }> = [
    { key: 'match', label: `Match (${teams.length})` },
    { key: 'race', label: `Race (${races.length})` },
  ];

  return (
    <Screen>
      <Text style={typography.subtitle}>Match titles and race kings, newest first.</Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.pressed]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'match' ? (
        teams.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title="No title matches yet"
            message={'Turn on "Crowns champions" when you log a final.'}
            actionLabel="Start a match"
            onAction={() => router.push('/match/new')}
          />
        ) : (
          teams.map((row) => (
            <Card
              key={row.matchId}
              tone={row.isCurrent ? 'highlight' : 'default'}
              style={styles.card}
              onPress={() => router.push(`/match/${row.matchId}`)}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.kind, row.isCurrent && styles.kindCurrent]}>
                  {row.isCurrent ? 'CURRENT' : row.format === 'singles' ? 'SINGLES' : 'DOUBLES'}
                  {row.viaForfeit ? ' · FORFEIT' : ''}
                </Text>
                <Text style={styles.when}>{formatDateTimeSubtle(row.crownedAt)}</Text>
              </View>
              <Text style={styles.names} numberOfLines={2}>
                {row.playerIds.map((id) => nameOf(id)).join(' & ')}
              </Text>
              <Text style={styles.meta}>
                {row.namedLabel ? `${row.namedLabel} · ` : ''}
                {row.scoreLine}
              </Text>
            </Card>
          ))
        )
      ) : races.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No race kings yet"
          message="Crown a race-to-score when you finish one."
          actionLabel="Start a race"
          onAction={() => router.push('/race/new')}
        />
      ) : (
        races.map((row) => (
          <Card
            key={row.raceId}
            tone={row.isCurrent ? 'highlight' : 'default'}
            style={styles.card}
            onPress={() => router.push(`/race/${row.raceId}`)}
          >
            <View style={styles.cardTop}>
              <Text style={[styles.kind, row.isCurrent && styles.kindCurrent]}>
                {row.isCurrent ? 'CURRENT KING' : 'RACE'}
              </Text>
              <Text style={styles.when}>{formatDateTimeSubtle(row.crownedAt)}</Text>
            </View>
            <Text style={styles.names} numberOfLines={2}>
              {nameOf(row.playerId)}
            </Text>
            <Text style={styles.meta}>
              {row.namedLabel ? `${row.namedLabel} · ` : ''}
              Race to {row.targetScore}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
      marginTop: spacing.lg,
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
    card: {
      marginBottom: spacing.sm,
      gap: 4,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    kind: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      color: c.textMuted,
    },
    kindCurrent: {
      color: c.primary,
    },
    when: {
      fontFamily: fonts.body,
      fontSize: 11,
      color: c.textMuted,
    },
    names: {
      fontFamily: fonts.bodyBold,
      fontSize: 17,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
  });
