import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as playersService from '@/features/players/services/players.service';
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
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { confirmAction } from '@/shared/utils/confirm';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

interface FixtureRowProps {
  a: string;
  b: string;
  winner: string;
  matchId: string;
  score: string | null;
  canStart: boolean;
  onStart: () => void;
  name: (id: string) => string;
}

function FixtureRow({
  a,
  b,
  winner,
  matchId,
  score,
  canStart,
  onStart,
  name,
}: FixtureRowProps): ReactNode {
  const styles = useStyles(makeStyles);
  return (
    <Card style={styles.fixture}>
      <View style={styles.sides}>
        <Text style={[styles.side, winner !== '' && winner === a && styles.won]} numberOfLines={1}>
          {a ? name(a) : 'Bye / to be decided'}
        </Text>
        <Text style={styles.score}>{score ?? 'vs'}</Text>
        <Text
          style={[styles.side, styles.right, winner !== '' && winner === b && styles.won]}
          numberOfLines={1}
        >
          {b ? name(b) : 'Bye / to be decided'}
        </Text>
      </View>
      {matchId ? (
        <Button
          label={winner ? 'View match' : 'Open live match'}
          size="sm"
          variant="ghost"
          onPress={() => router.push(`/match/${matchId}`)}
        />
      ) : canStart ? (
        <Button label="Start match" size="sm" icon="play" onPress={onStart} />
      ) : null}
    </Card>
  );
}

/** A tournament: knockout bracket or round-robin table, with fixtures to start and follow. */
export default function TournamentScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, league } = useSession();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [state, setState] = useState<TournamentState | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

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

  return (
    <Screen>
      <Text style={styles.title}>{t.name}</Text>
      <Text style={styles.meta}>
        {t.format === 'knockout' ? 'Knockout' : 'Round robin'} - best of {t.bestOf} -{' '}
        {state.completed ? `Champion: ${name(state.champion)}` : 'In progress'}
      </Text>
      <View style={styles.actions}>
        <Button
          label="Share bracket"
          icon="share-social-outline"
          size="sm"
          variant="secondary"
          onPress={() => void share()}
        />
        {canManage ? (
          <Button
            label="Delete"
            icon="trash-outline"
            size="sm"
            variant="ghost"
            onPress={() => void remove()}
          />
        ) : null}
      </View>

      {state.format === 'knockout'
        ? (state.rounds ?? []).map((slots, r) => (
            <View key={r}>
              <SectionTitle title={roundName(r, state.rounds?.length ?? 1)} />
              {slots.map((s) => (
                <FixtureRow
                  key={`${s.round}:${s.slot}`}
                  a={s.a}
                  b={s.b}
                  winner={s.winner}
                  matchId={s.matchId}
                  score={s.matchId ? `${s.framesA} - ${s.framesB}` : null}
                  canStart={!s.matchId && s.a !== '' && s.b !== '' && !s.winner}
                  onStart={() => void start(s.round, s.slot)}
                  name={name}
                />
              ))}
            </View>
          ))
        : null}

      {state.format === 'round_robin' ? (
        <>
          <SectionTitle title="Table" />
          <Card>
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
          <SectionTitle title="Fixtures" />
          {(state.pairings ?? []).map((p) => (
            <FixtureRow
              key={p.slot}
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
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    title: {
      fontFamily: fonts.display,
      fontSize: 24,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
      marginTop: spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginVertical: spacing.md,
    },
    fixture: {
      marginBottom: spacing.sm,
      gap: spacing.xs,
    },
    sides: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    side: {
      flex: 1,
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
  });
