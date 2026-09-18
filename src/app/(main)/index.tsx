import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as matchService from '@/features/match/services/match.service';
import { listPlayers } from '@/features/players/services/players.service';
import { listFeed } from '@/features/stats/services/stats.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore, loadStore } from '@/shared/storage/local-store';
import type { FeedEvent, Player } from '@/shared/types/domain';
import { formatLastMatchDay } from '@/shared/utils/datetime';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function HomeScreen(): ReactNode {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [lastMatchAt, setLastMatchAt] = useState<string | null>(null);

  const leagueId = league?.id;

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    await loadStore();
    setPlayers(await listPlayers(leagueId));
    setEvents(listFeed(getStore().events, leagueId, 8));
    setLastMatchAt(await matchService.getLastMatchPlayedAt(leagueId));
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  if (!league || !user) {
    return null;
  }

  const nameOf = (id: string): string => players.find((p) => p.id === id)?.displayName ?? 'Player';

  const me = players.find((p) => p.authUid === user.uid);
  const hasRoster = players.length >= 2;
  const hasHistory = events.length > 0;
  const teamTitle = league.reigningTeam
    ? league.reigningTeam.playerIds.map((id) => nameOf(id)).join(' & ')
    : null;
  const raceKing = league.raceKing ? nameOf(league.raceKing.playerId) : null;
  const lastMatchDay = formatLastMatchDay(lastMatchAt);

  return (
    <Screen>
      <View style={styles.brandRow}>
        <BrandLogo size={56} style={styles.homeLogo} />
        <View style={styles.brandText}>
          <Text style={typography.label}>{league.name}</Text>
          <Text style={styles.homeBrand}>Snooker</Text>
        </View>
      </View>
      <Text style={styles.greeting}>Welcome back, {user.displayName}</Text>
      <Text style={styles.lastPlayed}>
        Last match day · <Text style={styles.lastPlayedValue}>{lastMatchDay}</Text>
      </Text>

      <View style={styles.champPanel}>
        <Text style={typography.label}>Reigning champions</Text>
        <Text style={styles.champNames}>{teamTitle ?? 'Waiting for a crowning match'}</Text>
        {league.reigningTeam?.namedLabel ? (
          <Text style={styles.meta}>{league.reigningTeam.namedLabel}</Text>
        ) : (
          <Text style={styles.meta}>Tip: turn on “Crowns champions” when you log a final</Text>
        )}
      </View>

      <View style={styles.statStrip}>
        <StatCell label="Race king" value={raceKing ?? '—'} />
        <StatCell label="Your doubles" value={me ? `${me.stats.standard.winPct}%` : '—'} />
        <StatCell label="Race 1sts" value={me ? `${me.stats.race.firstPct}%` : '—'} />
      </View>

      {!hasRoster ? (
        <View style={styles.guide}>
          <Text style={styles.guideTitle}>First: add your table</Text>
          <Text style={styles.guideBody}>
            Add friends (or guests without the app) so you can pick teams and race entrants.
          </Text>
          <Button label="Add players" onPress={() => router.push('/(main)/players')} />
        </View>
      ) : !hasHistory ? (
        <View style={styles.guide}>
          <Text style={styles.guideTitle}>Ready to play</Text>
          <Text style={styles.guideBody}>
            Log a singles or doubles match, or an individual race. Winners show up here.
          </Text>
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Button
          label="Log match"
          onPress={() => router.push('/match/new')}
          style={styles.cta}
          disabled={!hasRoster || players.length < 2}
        />
        <Button
          label="Log race"
          variant="secondary"
          onPress={() => router.push('/race/new')}
          style={styles.cta}
          disabled={!hasRoster}
        />
      </View>
      {hasRoster && players.length < 2 ? (
        <Text style={styles.ctaHint}>Add at least one more player to log a match.</Text>
      ) : hasRoster && players.length < 4 ? (
        <Text style={styles.ctaHint}>Singles works with 2 · doubles needs 4.</Text>
      ) : null}

      <View style={styles.quickRow}>
        <Pressable style={styles.quick} onPress={() => router.push('/(main)/stats')}>
          <Text style={styles.quickTitle}>Stats</Text>
          <Text style={styles.quickHint}>Charts & form</Text>
        </Pressable>
        <Pressable style={styles.quick} onPress={() => router.push('/(main)/history')}>
          <Text style={styles.quickTitle}>History</Text>
          <Text style={styles.quickHint}>Past games</Text>
        </Pressable>
      </View>

      <Text style={[typography.label, styles.feedLabel]}>Recent</Text>
      {events.length === 0 ? (
        <Text style={typography.subtitle}>Nothing yet — your first result lands here.</Text>
      ) : (
        events.map((ev) => (
          <View key={ev.id} style={styles.feedItem}>
            <Text style={styles.feedTitle}>{ev.title}</Text>
            <Text style={styles.feedBody}>{ev.body}</Text>
          </View>
        ))
      )}
    </Screen>
  );
}

function StatCell({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <View style={styles.statCol}>
      <Text style={typography.label}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  homeLogo: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  brandText: {
    flex: 1,
    gap: 2,
  },
  homeBrand: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.chalk,
  },
  greeting: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginTop: spacing.xs,
    fontSize: 15,
  },
  lastPlayed: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  lastPlayedValue: {
    fontFamily: fonts.bodyMedium,
    color: colors.goldSoft,
  },
  champPanel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  champNames: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.goldSoft,
    lineHeight: 32,
  },
  meta: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  statStrip: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCol: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 18,
  },
  guide: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  guideTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.chalk,
  },
  guideBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.chalkMuted,
    marginBottom: spacing.sm,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cta: {
    flex: 1,
  },
  ctaHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  quick: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceBright,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: 2,
  },
  quickTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 16,
  },
  quickHint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
  },
  feedLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  feedItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  feedTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
  },
  feedBody: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
  },
});
