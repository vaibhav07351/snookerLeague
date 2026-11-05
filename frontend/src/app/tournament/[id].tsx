import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/shared/ui/Screen';
import * as playersService from '@/features/players/services/players.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { tournamentRules } from '@/features/rules/services/rules';
import { roundName, type TournamentState } from '@/features/tournament/services/bracket';
import * as tournamentService from '@/features/tournament/services/tournament.service';
import { getApiBaseUrl } from '@/shared/config/env';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Tournament } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LoadingState } from '@/shared/ui/LoadingState';
import { notify } from '@/shared/ui/notify';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

type RobinTab = 'table' | 'fixtures';

const ROBIN_TABS = [
  { key: 'table', label: 'Table' },
  { key: 'fixtures', label: 'Fixtures' },
] as const;

/** Tab-sized round label: "Final", "Semis", "QF", "R16". */
function shortRoundName(round: number, rounds: number): string {
  const full = roundName(round, rounds);
  if (full === 'Semi-finals') {
    return 'Semis';
  }
  if (full === 'Quarter-finals') {
    return 'QF';
  }
  return full.replace('Round of ', 'R');
}

interface FixtureRowProps {
  a: string;
  b: string;
  winner: string;
  matchId: string;
  score: string | null;
  canStart: boolean;
  onStart: () => void;
  name: (id: string) => string;
  first: boolean;
  /** Shown for a missing player: "Bye" in round 1 (no opponent), else "TBD" (not decided). */
  emptyLabel?: string;
}

/** One fixture as a single tappable line: open the match, or start it when it is ready. */
function FixtureRow({
  a,
  b,
  winner,
  matchId,
  score,
  canStart,
  onStart,
  name,
  first,
  emptyLabel = 'TBD',
}: FixtureRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const action = matchId ? () => router.push(`/match/${matchId}`) : canStart ? onStart : undefined;
  const sideA = a ? name(a) : emptyLabel;
  const sideB = b ? name(b) : emptyLabel;
  return (
    <Pressable
      accessibilityRole={action ? 'button' : undefined}
      accessibilityLabel={
        matchId
          ? `${sideA} versus ${sideB}, open match`
          : canStart
            ? `Start ${sideA} versus ${sideB}`
            : `${sideA} versus ${sideB}`
      }
      disabled={!action}
      onPress={action}
      style={({ pressed }) => [styles.fixture, !first && styles.divider, pressed && styles.pressed]}
    >
      <Text style={[styles.side, winner !== '' && winner === a && styles.won]} numberOfLines={1}>
        {sideA}
      </Text>
      <Text style={styles.score}>{score ?? 'vs'}</Text>
      <Text
        style={[styles.side, styles.right, winner !== '' && winner === b && styles.won]}
        numberOfLines={1}
      >
        {sideB}
      </Text>
      <View style={styles.fixtureIcon}>
        {matchId ? (
          <Ionicons
            name={winner ? 'chevron-forward' : 'radio-button-on'}
            size={18}
            color={winner ? palette.textFaint : palette.live}
          />
        ) : canStart ? (
          <Ionicons name="play-circle" size={24} color={palette.primary} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** A tournament: knockout bracket or round-robin table, with fixtures to start and follow. */
export default function TournamentScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, league } = useSession();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [state, setState] = useState<TournamentState | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // null = follow the current round automatically until the user picks one.
  const [pickedRound, setPickedRound] = useState<number | null>(null);
  const [robinTab, setRobinTab] = useState<RobinTab>('fixtures');

  const reload = useCallback(async () => {
    if (!id) {
      return;
    }
    const t = await tournamentService.getTournament(id);
    setTournament(t);
    if (t) {
      setState(tournamentService.stateOf(t).state);
      const roster = await playersService.listPlayers(t.leagueId);
      setNames(new Map(roster.map((p) => [p.id, p.displayName])));
    }
  }, [id]);
  useStoreReload(reload, id ?? null);

  if (tournament === undefined) {
    return (
      <Screen>
        <LoadingState label="Loading tournament" />
      </Screen>
    );
  }
  if (!tournament || !state) {
    return (
      <Screen>
        <EmptyState icon="trophy-outline" title="Tournament not found" />
      </Screen>
    );
  }
  const t = tournament;
  const name = (pid: string): string => names.get(pid) ?? 'Player';
  const canManage = user?.uid === t.createdByUid || user?.uid === league?.createdByUid;

  async function start(round: number, slot: number): Promise<void> {
    if (!user) {
      return;
    }
    try {
      const match = await tournamentService.startFixture({
        tournamentId: t.id,
        round,
        slot,
        uid: user.uid,
      });
      router.push(`/match/${match.id}`);
    } catch (error) {
      notify.error('Could not start the match', toUserMessage(error));
    }
  }

  async function share(): Promise<void> {
    const url = `${getApiBaseUrl() || 'https://snookit.duckdns.org'}/t/${t.id}`;
    try {
      await Share.share({ message: `${t.name} on Snookit\n${url}`, url });
    } catch (error) {
      notify.error('Could not share', toUserMessage(error));
    }
  }

  async function remove(): Promise<void> {
    const ok = await confirmAction(
      'Delete tournament?',
      'The bracket goes away; matches already played stay in the league history.',
      'Delete',
    );
    if (!ok || !user) {
      return;
    }
    try {
      await tournamentService.deleteTournament(t.id, user.uid);
      router.back();
    } catch (error) {
      notify.error('Could not delete', toUserMessage(error));
    }
  }

  const rounds = state.rounds ?? [];
  // The current round is the first one with an undecided fixture; the final once all are done.
  const currentRound = Math.max(
    0,
    rounds.findIndex((slots) => slots.some((s) => !s.winner)),
  );
  const shownRound = Math.min(pickedRound ?? currentRound, Math.max(0, rounds.length - 1));
  const roundTabs = rounds.map((_, r) => ({
    key: String(r),
    label: shortRoundName(r, rounds.length),
  }));

  return (
    <Screen>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {t.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t.format === 'knockout' ? 'Knockout' : 'Round robin'} · best of {t.bestOf} ·{' '}
            {state.completed ? `Champion: ${name(state.champion)}` : 'In progress'}
          </Text>
        </View>
        <RulesButton iconOnly rules={tournamentRules(t.format, t.bestOf)} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share bracket"
          onPress={() => void share()}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        >
          <Ionicons name="share-social-outline" size={20} color={palette.text} />
        </Pressable>
        {canManage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete tournament"
            onPress={() => void remove()}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={20} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {state.format === 'knockout' && rounds.length > 0 ? (
        <>
          {rounds.length > 1 ? (
            <SegmentedTabs
              items={roundTabs}
              value={String(shownRound)}
              onChange={(key) => setPickedRound(Number(key))}
              size="sm"
              style={styles.tabs}
            />
          ) : null}
          <Card style={styles.list}>
            {(rounds[shownRound] ?? []).map((s, i) => (
              <FixtureRow
                key={`${s.round}:${s.slot}`}
                first={i === 0}
                a={s.a}
                b={s.b}
                winner={s.winner}
                matchId={s.matchId}
                score={s.matchId ? `${s.framesA} - ${s.framesB}` : null}
                canStart={!s.matchId && s.a !== '' && s.b !== '' && !s.winner}
                onStart={() => void start(s.round, s.slot)}
                name={name}
                emptyLabel={s.round === 0 ? 'Bye' : 'TBD'}
              />
            ))}
          </Card>
        </>
      ) : null}

      {state.format === 'round_robin' ? (
        <>
          <SegmentedTabs
            items={ROBIN_TABS}
            value={robinTab}
            onChange={setRobinTab}
            size="sm"
            style={styles.tabs}
          />
          {robinTab === 'table' ? (
            <Card>
              <View style={styles.tableRow}>
                <Text style={[styles.tableName, styles.tableHead]}>Player</Text>
                <Text style={[styles.tableNum, styles.tableHead]}>W-L | Frames +/- | Points</Text>
              </View>
              {(state.standings ?? []).map((row, i) => (
                <View key={row.playerId} style={styles.tableRow}>
                  <Text style={styles.tableName} numberOfLines={1}>
                    {i + 1}. {name(row.playerId)}
                  </Text>
                  <Text style={styles.tableNum}>
                    {row.won}-{row.lost} | {row.framesFor - row.framesAgainst >= 0 ? '+' : ''}
                    {row.framesFor - row.framesAgainst} | {row.points} pts
                  </Text>
                </View>
              ))}
            </Card>
          ) : (
            <Card style={styles.list}>
              {/* Unplayed fixtures first: they are the ones people come here to start. */}
              {[...(state.pairings ?? [])]
                .sort((x, y) => Number(x.winner !== '') - Number(y.winner !== ''))
                .map((p, i) => (
                  <FixtureRow
                    key={p.slot}
                    first={i === 0}
                    a={p.a}
                    b={p.b}
                    winner={p.winner}
                    matchId={p.matchId}
                    score={null}
                    canStart={!p.matchId}
                    onStart={() => void start(0, p.slot)}
                    name={name}
                  />
                ))}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    headText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 24,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    iconBtn: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    tabs: {
      marginTop: spacing.md,
    },
    list: {
      marginTop: spacing.md,
      paddingVertical: 0,
    },
    fixture: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
    },
    divider: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    side: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      fontSize: 15,
      color: c.text,
    },
    right: {
      textAlign: 'right',
    },
    won: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
    },
    score: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.textMuted,
    },
    fixtureIcon: {
      width: 28,
      alignItems: 'flex-end',
    },
    tableRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      gap: spacing.sm,
    },
    tableName: {
      flex: 1,
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.text,
    },
    tableNum: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    tableHead: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      color: c.textFaint,
    },
  });
