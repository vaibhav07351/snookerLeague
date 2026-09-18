import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { MatchCelebration } from '@/features/match/components/MatchCelebration';
import { MatchFrameList } from '@/features/match/components/MatchFrameList';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Match, Player } from '@/shared/types/domain';
import { formatDuration } from '@/shared/utils/datetime';
import { colors, fonts, spacing, typography } from '@/theme/tokens';

function useLiveElapsed(startedAt: string | null | undefined, enabled: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!enabled || !startedAt) {
      setElapsed(0);
      return undefined;
    }
    const tick = (): void => {
      const start = Date.parse(startedAt);
      if (Number.isNaN(start)) {
        setElapsed(0);
        return;
      }
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, enabled]);

  return elapsed;
}

export default function MatchDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [aPts, setAPts] = useState('');
  const [bPts, setBPts] = useState('');
  const [tick, setTick] = useState(0);
  const [timingBusy, setTimingBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!id) {
      return;
    }
    const m = await matchService.getMatch(id);
    setMatch(m);
    if (m) {
      setPlayers(await playersService.listPlayers(m.leagueId));
    }
  }, [id]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  const timingOn = match?.timingEnabled === true;
  const liveElapsed = useLiveElapsed(
    match?.frameStartedAt,
    timingOn && match?.outcome.status === 'in_progress',
  );

  if (!match) {
    return (
      <Screen>
        <Text style={typography.subtitle}>Loading match…</Text>
      </Screen>
    );
  }

  const nameOf = (pid: string): string =>
    players.find((p) => p.id === pid)?.displayName ?? 'Player';
  const labels = matchService.playerNamesForMatch(match, nameOf);
  const isSingles = matchService.matchFormatOf(match) === 'singles';
  const sideALabel = isSingles ? 'A' : 'Team A';
  const sideBLabel = isSingles ? 'B' : 'Team B';
  const framesA = match.outcome.framesA;
  const framesB = match.outcome.framesB;
  const need = Math.floor(match.bestOf / 2) + 1;
  const finished = match.outcome.status !== 'in_progress';
  const viaForfeit = match.outcome.status === 'forfeited';
  const winnerLabel =
    match.outcome.status === 'completed' || match.outcome.status === 'forfeited'
      ? match.outcome.winner === 'a'
        ? labels.teamA
        : labels.teamB
      : null;
  const forfeitSummary = matchService.describeForfeit(match, nameOf);
  const scoreLockedLine =
    match.outcome.status === 'forfeited'
      ? [
          `Walked at ${match.outcome.scoreAtForfeit.framesA}–${match.outcome.scoreAtForfeit.framesB}`,
          (match.outcome.scoreAtForfeit.framePointsA ?? 0) > 0 ||
          (match.outcome.scoreAtForfeit.framePointsB ?? 0) > 0
            ? `frame pts ${match.outcome.scoreAtForfeit.framePointsA}–${match.outcome.scoreAtForfeit.framePointsB}`
            : null,
          `Final ${match.outcome.framesA}–${match.outcome.framesB}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  async function toggleTiming(enabled: boolean): Promise<void> {
    setTimingBusy(true);
    try {
      await matchService.setMatchTiming(match!.id, enabled);
    } catch (error) {
      Alert.alert('Could not update timer', toUserMessage(error));
    } finally {
      setTimingBusy(false);
    }
  }

  async function addWinner(winner: 'a' | 'b'): Promise<void> {
    try {
      await matchService.addFrame(match!.id, {
        teamAPoints: aPts.trim() === '' ? 0 : Number(aPts) || 0,
        teamBPoints: bPts.trim() === '' ? 0 : Number(bPts) || 0,
        winner,
      });
      setAPts('');
      setBPts('');
    } catch (error) {
      Alert.alert('Could not add frame', toUserMessage(error));
    }
  }

  async function clearTime(frameIndex: number): Promise<void> {
    try {
      await matchService.clearFrameDuration(match!.id, frameIndex);
    } catch (error) {
      Alert.alert('Could not clear time', toUserMessage(error));
    }
  }

  async function updateFrame(
    frameIndex: number,
    patch: { teamAPoints: number; teamBPoints: number; winner: 'a' | 'b' },
  ): Promise<void> {
    try {
      await matchService.updateFrame(match!.id, frameIndex, patch);
    } catch (error) {
      Alert.alert('Could not update frame', toUserMessage(error));
    }
  }

  async function deleteFrame(frameIndex: number): Promise<void> {
    try {
      await matchService.deleteFrame(match!.id, frameIndex);
    } catch (error) {
      Alert.alert('Could not delete frame', toUserMessage(error));
    }
  }

  async function forfeitFrame(side: 'a' | 'b'): Promise<void> {
    const quitting = side === 'a' ? labels.teamA : labels.teamB;
    const winning = side === 'a' ? labels.teamB : labels.teamA;
    const framePointsA = aPts.trim() === '' ? 0 : Number(aPts) || 0;
    const framePointsB = bPts.trim() === '' ? 0 : Number(bPts) || 0;
    const nextA = framesA + (side === 'b' ? 1 : 0);
    const nextB = framesB + (side === 'a' ? 1 : 0);
    const remaining = Math.max(0, match!.bestOf - nextA - nextB);
    const ownAfter = side === 'a' ? nextA : nextB;
    const matchWouldEnd = ownAfter + remaining < need;
    const pointsNow =
      framePointsA > 0 || framePointsB > 0
        ? `\nCurrent frame points: ${framePointsA}–${framePointsB}`
        : '';

    Alert.alert(
      'Forfeit this frame?',
      matchWouldEnd
        ? `${quitting} forfeit this frame (${framesA}–${framesB}).${pointsNow}\n\nThey can no longer reach ${need} frames — ${winning} win the match. That counts as a forfeit loss in stats.`
        : `${quitting} forfeit this frame (${framesA}–${framesB}).${pointsNow}\n\n${winning} take the frame; the match continues.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: matchWouldEnd ? 'Forfeit & end match' : 'Forfeit frame',
          style: 'destructive',
          onPress: () => {
            void matchService
              .forfeitFrame(match!.id, side, {
                teamAPoints: framePointsA,
                teamBPoints: framePointsB,
              })
              .then(() => {
                setAPts('');
                setBPts('');
              })
              .catch((error: unknown) => {
                Alert.alert('Forfeit failed', toUserMessage(error));
              });
          },
        },
      ],
    );
  }

  return (
    <Screen>
      {finished && winnerLabel ? (
        <MatchCelebration
          winnersLabel={winnerLabel}
          framesA={framesA}
          framesB={framesB}
          viaForfeit={viaForfeit}
          crownsChampion={match.crownsChampion}
          namedLabel={match.namedLabel}
          forfeitSummary={forfeitSummary}
          scoreLockedLine={scoreLockedLine}
        />
      ) : (
        <>
          {match.namedLabel ? <Text style={typography.label}>{match.namedLabel}</Text> : null}
          <Text style={styles.scoreline}>
            {framesA} – {framesB}
          </Text>
          <Text style={styles.teams}>
            {labels.teamA}
            {'\n'}vs{'\n'}
            {labels.teamB}
          </Text>
          <Text style={styles.meta}>
            {isSingles ? 'Singles' : 'Doubles'} · Best of {match.bestOf} · first to {need}
            {match.crownsChampion ? ' · Crowns champions' : ''}
          </Text>
        </>
      )}

      {match.outcome.status === 'in_progress' ? (
        <View style={styles.live}>
          <View style={styles.timerRow}>
            <View style={styles.timerCopy}>
              <Text style={styles.timerLabel}>Auto-time frames</Text>
              <Text style={styles.timerHint}>
                {timingOn
                  ? `Timing this frame · ${formatDuration(liveElapsed)}`
                  : 'Turn on to save duration when a side wins the frame'}
              </Text>
            </View>
            <Switch
              value={timingOn}
              disabled={timingBusy}
              onValueChange={(v) => void toggleTiming(v)}
              trackColor={{ false: colors.feltLight, true: colors.gold }}
            />
          </View>

          <Text style={typography.label}>Frame points</Text>
          <View style={styles.ptsRow}>
            <View style={styles.ptsField}>
              <TextField
                label={sideALabel}
                value={aPts}
                onChangeText={setAPts}
                keyboardType="number-pad"
                placeholder="e.g. 72"
              />
            </View>
            <View style={styles.ptsField}>
              <TextField
                label={sideBLabel}
                value={bPts}
                onChangeText={setBPts}
                keyboardType="number-pad"
                placeholder="e.g. 45"
              />
            </View>
          </View>
          <View style={styles.row}>
            <Button label="A wins frame" onPress={() => void addWinner('a')} style={styles.half} />
            <Button
              label="B wins frame"
              variant="secondary"
              onPress={() => void addWinner('b')}
              style={styles.half}
            />
          </View>
          <Text style={styles.forfeitHint}>
            Forfeit awards this frame only. The match ends automatically if the forfeiting side can
            no longer reach {need} frames.
          </Text>
          <View style={styles.row}>
            <Button
              label={`${labels.teamA.split(' & ')[0] ?? 'A'} forfeits`}
              variant="danger"
              onPress={() => void forfeitFrame('a')}
              style={styles.half}
            />
            <Button
              label={`${labels.teamB.split(' & ')[0] ?? 'B'} forfeits`}
              variant="danger"
              onPress={() => void forfeitFrame('b')}
              style={styles.half}
            />
          </View>
        </View>
      ) : null}

      <Text style={[typography.label, styles.framesLabel]}>Frames</Text>
      <MatchFrameList
        frames={match.frames}
        onUpdate={updateFrame}
        onDelete={deleteFrame}
        onClearTime={clearTime}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreline: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.goldSoft,
    marginVertical: spacing.sm,
  },
  teams: {
    color: colors.chalk,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  meta: {
    color: colors.chalkMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  live: {
    gap: spacing.sm,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  timerCopy: {
    flex: 1,
    gap: 2,
  },
  timerLabel: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 15,
  },
  timerHint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  ptsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ptsField: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
  forfeitHint: {
    color: colors.chalkMuted,
    fontSize: 13,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  framesLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
