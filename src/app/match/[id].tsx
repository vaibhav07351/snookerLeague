import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import { FrameLiveRanks } from '@/features/match/components/FrameLiveRanks';
import { LiveScoreboard } from '@/features/match/components/LiveScoreboard';
import { ManualFrameForm } from '@/features/match/components/ManualFrameForm';
import { MatchCelebration } from '@/features/match/components/MatchCelebration';
import { MatchFrameList } from '@/features/match/components/MatchFrameList';
import { MatchScoreHeader } from '@/features/match/components/MatchScoreHeader';
import { MatchTimingHeader } from '@/features/match/components/MatchTimingHeader';
import * as frameRank from '@/features/match/services/frame-rank';
import * as matchService from '@/features/match/services/match.service';
import * as shotService from '@/features/match/services/shot.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { emptyOpenFrame, type Match, type Player } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
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
  const navigation = useNavigation();
  const { user } = useSession();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [timingBusy, setTimingBusy] = useState(false);
  const [manualDraft, setManualDraft] = useState<{
    teamAPoints: number;
    teamBPoints: number;
  } | null>(null);

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

  useStoreReload(reload, id ?? null);

  const matchId = match?.id;
  const timingOn = match?.timingEnabled === true;
  const inProgress = match?.outcome.status === 'in_progress';
  const canScore = user != null && match != null && shotService.isMatchScorer(match, user.uid);
  const liveElapsed = useLiveElapsed(match?.frameStartedAt, timingOn && inProgress === true);

  const toggleTiming = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!matchId) {
        return;
      }
      setTimingBusy(true);
      try {
        await matchService.setMatchTiming(matchId, enabled);
      } catch (error) {
        Alert.alert('Could not update timer', toUserMessage(error));
      } finally {
        setTimingBusy(false);
      }
    },
    [matchId],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: inProgress
        ? () => (
            <MatchTimingHeader
              enabled={timingOn}
              elapsedSeconds={liveElapsed}
              disabled={timingBusy || !canScore}
              onToggle={(next) => {
                void toggleTiming(next);
              }}
            />
          )
        : undefined,
    });
  }, [navigation, inProgress, timingOn, liveElapsed, timingBusy, canScore, toggleTiming]);

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
    const live = match!.openFrame;
    const framePointsA = live?.teamAPoints ?? 0;
    const framePointsB = live?.teamBPoints ?? 0;
    const nextA = framesA + (side === 'b' ? 1 : 0);
    const nextB = framesB + (side === 'a' ? 1 : 0);
    const remaining = Math.max(0, match!.bestOf - nextA - nextB);
    const ownAfter = side === 'a' ? nextA : nextB;
    const matchWouldEnd = ownAfter + remaining < need;
    const pointsNow =
      framePointsA > 0 || framePointsB > 0
        ? `\nCurrent frame points: ${framePointsA}–${framePointsB}`
        : '';
    const confirmLabel = matchWouldEnd ? 'Forfeit & end match' : 'Forfeit frame';
    const ok = await confirmAction(
      'Forfeit this frame?',
      matchWouldEnd
        ? `${quitting} forfeit this frame (${framesA}–${framesB}).${pointsNow}\n\nThey can no longer reach ${need} frames — ${winning} win the match. That counts as a forfeit loss in stats.`
        : `${quitting} forfeit this frame (${framesA}–${framesB}).${pointsNow}\n\n${winning} take the frame; the match continues.`,
      confirmLabel,
    );
    if (!ok) {
      return;
    }
    try {
      await matchService.forfeitFrame(match!.id, side, {
        teamAPoints: framePointsA,
        teamBPoints: framePointsB,
      });
    } catch (error) {
      Alert.alert('Forfeit failed', toUserMessage(error));
    }
  }

  async function logManualFrame(frame: {
    teamAPoints: number;
    teamBPoints: number;
    winner: 'a' | 'b';
  }): Promise<void> {
    if (!match) {
      return;
    }
    const name = frame.winner === 'a' ? labels.teamA : labels.teamB;
    const liveShots = match.openFrame?.shots.length ?? 0;
    const extra = liveShots > 0 ? ' This clears the live shots currently on the table.' : '';
    const ok = await confirmAction(
      `${name}?`,
      `Frame ${frame.teamAPoints}–${frame.teamBPoints} to ${name}.${extra}`,
      'Log frame',
    );
    if (!ok) {
      return;
    }
    try {
      await matchService.addFrame(match.id, frame);
      setManualDraft(null);
    } catch (error) {
      Alert.alert('Could not add frame', toUserMessage(error));
    }
  }

  async function awardFrame(winner: 'a' | 'b'): Promise<void> {
    if (!match) {
      return;
    }
    if (manualDraft) {
      await logManualFrame({ ...manualDraft, winner });
      return;
    }
    const name = winner === 'a' ? labels.teamA : labels.teamB;
    const live = match.openFrame;
    const pts = `${live?.teamAPoints ?? 0}–${live?.teamBPoints ?? 0}`;
    const nextA = framesA + (winner === 'a' ? 1 : 0);
    const nextB = framesB + (winner === 'b' ? 1 : 0);
    const first = await confirmAction(`${name}?`, `Award this frame (${pts}) to ${name}?`, 'Yes');
    if (!first) {
      return;
    }
    const second = await confirmAction(
      'Confirm frame',
      `${name} take this frame. Score becomes ${nextA}–${nextB}. You can undo if this was a mistake.`,
      'Award',
    );
    if (!second) {
      return;
    }
    try {
      await shotService.completeLiveFrame(match.id, winner);
    } catch (error) {
      Alert.alert('Could not complete frame', toUserMessage(error));
    }
  }

  async function undoLive(): Promise<void> {
    if (!match) {
      return;
    }
    const open = match.openFrame;
    if (open && open.shots.length > 0) {
      try {
        await shotService.undoLastShot(match.id);
      } catch (error) {
        Alert.alert('Could not undo', toUserMessage(error));
      }
      return;
    }
    const last = match.frames[match.frames.length - 1];
    if (!last) {
      return;
    }
    const name = last.winner === 'a' ? labels.teamA : labels.teamB;
    const ok = await confirmAction(
      'Undo last frame?',
      `${name} won ${last.teamAPoints}–${last.teamBPoints}. Put that frame back on the table?`,
      'Undo frame',
    );
    if (!ok) {
      return;
    }
    try {
      await shotService.undoLastFrame(match.id);
    } catch (error) {
      Alert.alert('Could not undo frame', toUserMessage(error));
    }
  }

  const liveOpen = match.openFrame;
  const lastFrame = match.frames[match.frames.length - 1];
  const liveActive =
    (liveOpen?.shots.length ?? 0) > 0 ||
    (liveOpen?.teamAPoints ?? 0) > 0 ||
    (liveOpen?.teamBPoints ?? 0) > 0;
  const framePointsA = manualDraft
    ? manualDraft.teamAPoints
    : liveActive
      ? (liveOpen?.teamAPoints ?? 0)
      : (lastFrame?.teamAPoints ?? 0);
  const framePointsB = manualDraft
    ? manualDraft.teamBPoints
    : liveActive
      ? (liveOpen?.teamBPoints ?? 0)
      : (lastFrame?.teamBPoints ?? 0);
  const framePointsHint = manualDraft
    ? 'This frame · final score'
    : liveActive || !lastFrame
      ? 'This frame · live'
      : 'Last frame';

  const frameRanks = frameRank
    .rankFramePlayers(match.openFrame?.shots ?? [], [...match.teamA, ...match.teamB], {
      a: match.teamA,
      b: match.teamB,
    })
    .map((row) => ({
      ...row,
      name: nameOf(row.playerId),
    }));

  const teams = { a: match.teamA, b: match.teamB };
  const rosterIds = [...match.teamA, ...match.teamB];
  const matchPlayerRanks = frameRank
    .rankMatchPlayers(match.frames, rosterIds, teams)
    .map((row) => ({
      ...row,
      name: nameOf(row.playerId),
    }));
  const showMatchPlayerPoints = matchPlayerRanks.some((r) => r.scored > 0 || r.foulPoints > 0);
  const framePlayerPoints = match.frames.map((frame) =>
    frameRank.rankPlayersForFrame(frame, rosterIds, teams).map((row) => ({
      playerId: row.playerId,
      name: nameOf(row.playerId),
      scored: row.scored,
      foulPoints: row.foulPoints,
    })),
  );

  return (
    <Screen contentStyle={styles.screenContent}>
      {finished && winnerLabel ? (
        <>
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
          {showMatchPlayerPoints ? (
            <View style={styles.playerPoints}>
              <Text style={styles.playerPointsLabel}>Player points</Text>
              <FrameLiveRanks ranks={matchPlayerRanks} wide />
            </View>
          ) : null}
        </>
      ) : (
        <MatchScoreHeader
          framesA={framesA}
          framesB={framesB}
          openFrame={match.openFrame ?? emptyOpenFrame('a', match.teamA[0] ?? null)}
          teamALabel={labels.teamA}
          teamBLabel={labels.teamB}
          teamAPlayers={match.teamA.map((pid) => ({ id: pid, name: nameOf(pid) }))}
          teamBPlayers={match.teamB.map((pid) => ({ id: pid, name: nameOf(pid) }))}
          isDoubles={!isSingles}
          inProgress
          meta={`${isSingles ? 'Singles' : 'Doubles'} · Best of ${match.bestOf} · first to ${need}${match.crownsChampion ? ' · Crowns champions' : ''}`}
          namedLabel={match.namedLabel}
          canSelectPlayer={canScore}
          frameRanks={frameRanks}
          framePointsA={framePointsA}
          framePointsB={framePointsB}
          framePointsHint={framePointsHint}
          onSelectPlayer={(playerId) => {
            void shotService.setAtTablePlayer(match.id, playerId).catch((error: unknown) => {
              Alert.alert('Could not set scorer', toUserMessage(error));
            });
          }}
        />
      )}

      {finished && canScore && match.frames.length > 0 ? (
        <Pressable onPress={() => void undoLive()} style={styles.undoFrame}>
          <Text style={styles.undoFrameText}>Undo last frame</Text>
        </Pressable>
      ) : null}

      {match.outcome.status === 'in_progress' ? (
        <View style={styles.live}>
          <LiveScoreboard
            openFrame={match.openFrame ?? emptyOpenFrame('a')}
            teamALabel={labels.teamA}
            teamBLabel={labels.teamB}
            canScore={canScore}
            canUndo={(match.openFrame?.shots.length ?? 0) > 0 || match.frames.length > 0}
            onPot={(ball) => {
              void shotService
                .recordShot(match.id, { kind: 'pot', ball })
                .catch((error: unknown) => {
                  Alert.alert('Could not record shot', toUserMessage(error));
                });
            }}
            onFoul={(points) => {
              void shotService
                .recordShot(match.id, { kind: 'foul', points })
                .catch((error: unknown) => {
                  Alert.alert('Could not record foul', toUserMessage(error));
                });
            }}
            onEndVisit={(kind) => {
              void shotService.recordShot(match.id, { kind }).catch((error: unknown) => {
                Alert.alert('Could not end visit', toUserMessage(error));
              });
            }}
            onFreeBall={() => {
              void shotService
                .recordShot(match.id, { kind: 'free_ball' })
                .catch((error: unknown) => {
                  Alert.alert('Could not record free ball', toUserMessage(error));
                });
            }}
            onUndo={() => void undoLive()}
            onFrameWon={(winner) => void awardFrame(winner)}
          />
          <View style={styles.toolbar}>
            <Pressable onPress={() => void forfeitFrame('a')} style={styles.forfeit}>
              <Text style={styles.forfeitText} numberOfLines={2}>
                {labels.teamA} forfeit
              </Text>
            </Pressable>
            <Pressable onPress={() => void forfeitFrame('b')} style={styles.forfeit}>
              <Text style={styles.forfeitText} numberOfLines={2}>
                {labels.teamB} forfeit
              </Text>
            </Pressable>
          </View>
          {canScore ? (
            <ManualFrameForm
              teamALabel={labels.teamA}
              teamBLabel={labels.teamB}
              onDraftChange={setManualDraft}
              onSubmit={logManualFrame}
            />
          ) : null}
        </View>
      ) : null}

      <Text style={[typography.label, styles.framesLabel]}>Frames</Text>
      <MatchFrameList
        frames={match.frames}
        playerPoints={framePlayerPoints}
        onUpdate={updateFrame}
        onDelete={deleteFrame}
        onClearTime={clearTime}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing.lg,
  },
  live: {
    gap: 6,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingVertical: 4,
  },
  forfeit: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 92, 0.5)',
    backgroundColor: 'rgba(255, 107, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forfeitText: {
    fontFamily: fonts.bodyBold,
    color: colors.danger,
    fontSize: 12,
    textAlign: 'center',
  },
  undoFrame: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  undoFrameText: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
  },
  framesLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  playerPoints: {
    marginBottom: spacing.md,
    gap: 6,
  },
  playerPointsLabel: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
  },
});
