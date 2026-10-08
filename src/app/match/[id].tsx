import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/features/home/components/Screen';
import { FrameLiveRanks, type FrameRankView } from '@/features/match/components/FrameLiveRanks';
import { LiveScoreboard } from '@/features/match/components/LiveScoreboard';
import { ManualFrameForm } from '@/features/match/components/ManualFrameForm';
import { MatchCelebration } from '@/features/match/components/MatchCelebration';
import { MatchFrameList, type FramePlayerLine } from '@/features/match/components/MatchFrameList';
import { MatchOptions } from '@/features/match/components/MatchOptions';
import { MatchScoreHeader, type ScoreSideView } from '@/features/match/components/MatchScoreHeader';
import { MatchSummaryCard } from '@/features/match/components/MatchSummaryCard';
import { MatchTimingHeader } from '@/features/match/components/MatchTimingHeader';
import { MidwaySetup } from '@/features/match/components/MidwaySetup';
import { ScoringStatus } from '@/features/match/components/ScoringStatus';
import {
  matchAdmin,
  matchService,
  shotService,
  useMatchScreen,
} from '@/features/match/hooks/use-match-screen';
import { summarizeMatch } from '@/features/match/services/match-summary';
import { notify } from '@/shared/ui/notify';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HeaderBack, useSafeBack } from '@/shared/ui/HeaderBack';
import { HintCard } from '@/shared/ui/HintCard';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { confirmAction } from '@/shared/utils/confirm';
import type { Match } from '@/shared/types/domain';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

function useLiveElapsed(startedAt: string | null | undefined, enabled: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!enabled || !startedAt) {
      setElapsed(0);
      return undefined;
    }
    const start = Date.parse(startedAt);
    const tick = (): void => {
      setElapsed(Number.isNaN(start) ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, enabled]);
  return elapsed;
}

function headerTitle(match: Match): string {
  if (match.namedLabel) {
    return match.namedLabel;
  }
  return match.crownsChampion ? 'Title match' : 'Match';
}

export default function MatchDetailScreen(): ReactNode {
  const { id, midway } = useLocalSearchParams<{ id: string; midway?: string }>();
  const navigation = useNavigation();
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const s = useMatchScreen(id);
  const { match } = s;
  const goBack = useSafeBack('/(main)');
  const [showManual, setShowManual] = useState(false);
  // Opened from "New match" with "We are already mid-match" switched on.
  const [showMidway, setShowMidway] = useState(midway === '1');

  const inProgress = match?.outcome.status === 'in_progress';
  const timingOn = match?.timingEnabled === true;
  const elapsed = useLiveElapsed(match?.frameStartedAt, timingOn && inProgress);
  const matchId = match?.id;
  const { run, canScore, busy } = s;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: match ? headerTitle(match) : 'Match',
      headerLeft: () => <HeaderBack fallback="/(main)" />,
      headerRight:
        inProgress && matchId
          ? () => (
              <MatchTimingHeader
                enabled={timingOn}
                pending={!match?.frameStartedAt}
                elapsedSeconds={elapsed}
                disabled={busy || !canScore}
                onToggle={(next) =>
                  void run('Could not change the timer', () =>
                    matchService.setMatchTiming(matchId, next),
                  )
                }
              />
            )
          : undefined,
    });
  }, [navigation, match, matchId, inProgress, timingOn, elapsed, busy, canScore, run]);

  // Per-frame player lines and the live frame's per-player points (short names: first
  // names, surnames only when two players share a first name).
  const { shortName } = s;
  const frameLines = useMemo<FramePlayerLine[][]>(() => {
    if (!match) {
      return [];
    }
    return match.frames.map((frame) =>
      summarizeMatch({ ...match, frames: [frame], openFrame: null }).players.map((p) => ({
        playerId: p.playerId,
        name: shortName(p.playerId),
        side: p.side,
        scored: p.scored,
        foulPoints: p.foulPoints,
        highestBreak: p.highestBreak,
      })),
    );
  }, [match, shortName]);

  const liveRanks = useMemo<FrameRankView[]>(() => {
    if (!match?.openFrame) {
      return [];
    }
    return summarizeMatch({ ...match, frames: [] }, true).players.map((p) => ({
      playerId: p.playerId,
      name: shortName(p.playerId),
      side: p.side,
      scored: p.scored,
      foulPoints: p.foulPoints,
      highestBreak: p.highestBreak,
    }));
  }, [match, shortName]);
  const liveFramePoints = useMemo(
    () => new Map(liveRanks.map((r) => [r.playerId, r.scored])),
    [liveRanks],
  );

  if (match === undefined) {
    return (
      <Screen>
        <ActivityIndicator color={palette.primary} style={styles.loading} />
      </Screen>
    );
  }
  if (match === null) {
    return (
      <Screen>
        <EmptyState
          icon="help-circle-outline"
          title="Match not found"
          message="It may have been deleted, or it has not synced to this phone yet."
          actionLabel="Go back"
          onAction={goBack}
        />
      </Screen>
    );
  }

  const m = match;
  const open = m.openFrame ?? null;
  const finished = !inProgress;
  const labelA = s.sideLabel('a', true);
  const labelB = s.sideLabel('b', true);
  const fullA = s.sideLabel('a');
  const fullB = s.sideLabel('b');
  const hbByPlayer = new Map(s.summary?.players.map((p) => [p.playerId, p.highestBreak]) ?? []);

  const sideView = (side: 'a' | 'b'): ScoreSideView => {
    const ids = side === 'a' ? m.teamA : m.teamB;
    const lastFrame = m.frames[m.frames.length - 1];
    const framePoints = open
      ? side === 'a'
        ? open.teamAPoints
        : open.teamBPoints
      : side === 'a'
        ? (lastFrame?.teamAPoints ?? 0)
        : (lastFrame?.teamBPoints ?? 0);
    return {
      side,
      framePoints,
      frames: side === 'a' ? m.outcome.framesA : m.outcome.framesB,
      players: ids.map((pid) => ({
        id: pid,
        name: s.shortName(pid),
        framePoints: liveFramePoints.get(pid) ?? 0,
        highestBreak: hbByPlayer.get(pid) ?? 0,
      })),
    };
  };

  const deficit = open
    ? Math.max(
        0,
        open.atTable === 'a'
          ? open.teamBPoints - open.teamAPoints
          : open.teamAPoints - open.teamBPoints,
      )
    : 0;
  // While scoring, the ball pad sits right under the score so logging needs no scrolling;
  // status lines and tips move below it.
  const scoring = inProgress && canScore;
  const canStartMidway =
    inProgress &&
    canScore &&
    m.frames.length === 0 &&
    (open?.shots.length ?? 0) === 0 &&
    !open?.carriedPoints;

  async function awardFrame(winner: 'a' | 'b'): Promise<void> {
    if (!open) {
      return;
    }
    const name = winner === 'a' ? fullA : fullB;
    const winnerPts = winner === 'a' ? open.teamAPoints : open.teamBPoints;
    const loserPts = winner === 'a' ? open.teamBPoints : open.teamAPoints;
    const behind =
      winnerPts < loserPts
        ? `\n\nNote: ${name} are behind on points (${winnerPts}-${loserPts}).`
        : '';
    const ok = await confirmAction(
      `Frame to ${name}?`,
      `End this frame at ${open.teamAPoints}-${open.teamBPoints} with ${name} winning it. You can undo this.${behind}`,
      'End frame',
    );
    if (ok) {
      await run('Could not end the frame', () => shotService.completeLiveFrame(m.id, winner));
    }
  }

  async function logManualFrame(frame: {
    teamAPoints: number;
    teamBPoints: number;
    winner: 'a' | 'b';
  }): Promise<void> {
    const name = frame.winner === 'a' ? fullA : fullB;
    const shots = open?.shots.length ?? 0;
    const ok = await confirmAction(
      `Frame to ${name}?`,
      `Log ${frame.teamAPoints}-${frame.teamBPoints} to ${name}.${shots > 0 ? ' The shots logged in this frame are replaced.' : ''}`,
      'Log frame',
    );
    if (ok && (await run('Could not log the frame', () => matchService.addFrame(m.id, frame)))) {
      setShowManual(false);
    }
  }

  async function undo(): Promise<void> {
    if (open && open.shots.length > 0) {
      await s.actions.undoShot();
      return;
    }
    const last = m.frames[m.frames.length - 1];
    if (!last) {
      return;
    }
    const name = last.winner === 'a' ? fullA : fullB;
    const ok = await confirmAction(
      'Undo the last frame?',
      `${name} won frame ${m.frames.length}${last.carriedOver ? '' : ` ${last.teamAPoints}-${last.teamBPoints}`}. Put it back on the table?`,
      'Undo frame',
    );
    if (ok) {
      await run('Could not undo the frame', () => shotService.undoLastFrame(m.id));
    }
  }

  async function forfeit(side: 'a' | 'b'): Promise<void> {
    const quitting = side === 'a' ? fullA : fullB;
    const winning = side === 'a' ? fullB : fullA;
    const ok = await confirmAction(
      `${quitting} concede this frame?`,
      `${winning} take the frame. If ${quitting} can no longer win the match, it ends and counts as a forfeit loss in stats.`,
      'Concede frame',
    );
    if (ok) {
      await run('Could not concede the frame', () => matchService.forfeitFrame(m.id, side));
    }
  }

  async function toggleTitle(on: boolean): Promise<void> {
    if (on) {
      const ok = await confirmAction(
        'Make this a title match?',
        'The winner of this match becomes the reigning league champion.',
        'Make title match',
      );
      if (!ok) {
        return;
      }
    }
    if (await run('Could not update the match', () => matchAdmin.setTitleMatch(m.id, on))) {
      notify.success(on ? 'This is now a title match' : 'No longer a title match');
    }
  }

  async function removeMatch(): Promise<void> {
    const ok = await confirmAction(
      inProgress ? 'Abandon and delete this match?' : 'Delete this match?',
      'It is removed for everyone in the league and stats are recalculated. This cannot be undone.',
      'Delete match',
    );
    if (ok && (await run('Could not delete the match', () => matchAdmin.deleteMatch(m.id)))) {
      notify.success('Match deleted');
      goBack();
    }
  }

  const winnerLabel =
    m.outcome.status === 'completed' || m.outcome.status === 'forfeited'
      ? m.outcome.winner === 'a'
        ? fullA
        : fullB
      : null;

  const scoringStatus = (
    <ScoringStatus
      canScore={canScore}
      canTakeOver={s.canTakeOver}
      scorerName={s.scorerName}
      busy={busy}
      onTakeOver={() =>
        void run('Could not take over scoring', () => matchAdmin.takeOverScoring(m.id))
      }
    />
  );

  const topBreak = s.summary?.topBreak;
  const frameNotes = (
    <>
      {topBreak && topBreak.value > 0 ? (
        <Text style={styles.topBreak}>
          Highest break so far: {topBreak.value} by{' '}
          <Text style={{ color: sideColor(palette, topBreak.side) }}>
            {topBreak.playerId ? s.shortName(topBreak.playerId) : s.sideLabel(topBreak.side, true)}
          </Text>
        </Text>
      ) : null}
      {open?.carriedPoints ? (
        <Text style={styles.banner}>
          Ball-by-ball scoring started at {open.carriedPoints.a}-{open.carriedPoints.b} in this
          frame.
        </Text>
      ) : null}
    </>
  );

  return (
    <Screen contentStyle={styles.content}>
      {finished && winnerLabel ? (
        <MatchCelebration
          winnersLabel={winnerLabel}
          framesA={m.outcome.framesA}
          framesB={m.outcome.framesB}
          viaForfeit={m.outcome.status === 'forfeited'}
          crownsChampion={m.crownsChampion}
          namedLabel={m.namedLabel}
          forfeitSummary={matchService.describeForfeit(m, s.fullName)}
          scoreLockedLine={null}
        />
      ) : null}

      {inProgress && !scoring ? scoringStatus : null}

      {inProgress ? (
        <MatchScoreHeader
          a={sideView('a')}
          b={sideView('b')}
          atTable={open ? open.atTable : null}
          atTablePlayerId={open?.atTablePlayerId ?? null}
          currentBreak={open?.currentBreak ?? 0}
          frameNumber={m.frames.length + 1}
          bestOf={m.bestOf}
          canSelectPlayer={canScore}
          onSelectPlayer={s.actions.selectPlayer}
        />
      ) : null}

      {inProgress && !scoring ? frameNotes : null}

      {inProgress && liveRanks.some((r) => r.scored > 0 || r.foulPoints > 0) ? (
        <Card style={styles.ranksCard}>
          <FrameLiveRanks ranks={liveRanks} title="This frame" />
        </Card>
      ) : null}

      {canStartMidway && showMidway ? (
        <Card>
          <MidwaySetup
            teamALabel={labelA}
            teamBLabel={labelB}
            framesToWin={matchService.framesToWin(m.bestOf)}
            onCancel={() => setShowMidway(false)}
            onSubmit={async (input) => {
              const ok = await run('Could not set the score', () =>
                matchAdmin.startFromCurrentScore(m.id, input),
              );
              if (ok) {
                setShowMidway(false);
                notify.success('Score set', 'Carry on scoring ball by ball from here.');
              }
              return ok;
            }}
          />
        </Card>
      ) : null}

      {inProgress && canScore && open && s.table ? (
        <LiveScoreboard
          table={s.table}
          deficit={deficit}
          teamALabel={labelA}
          teamBLabel={labelB}
          canUndo={open.shots.length > 0 || m.frames.length > 0}
          onPot={s.actions.pot}
          onFoul={s.actions.foul}
          onEndVisit={s.actions.endVisit}
          onFreeBall={s.actions.freeBall}
          onUndo={() => void undo()}
          onFrameWon={(winner) => void awardFrame(winner)}
        />
      ) : null}

      {scoring ? (
        <>
          {canStartMidway && !showMidway ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowMidway(true)}
              style={styles.linkRow}
            >
              <Text style={styles.link}>Already playing? Start from the current score</Text>
            </Pressable>
          ) : null}
          {frameNotes}
          {scoringStatus}
          <HintCard
            hintKey="live-scoring"
            title="Scoring in three taps"
            tips={[
              'Tap a ball each time it is potted. Glowing balls are the ones "on".',
              'Miss or Safety hands the table to the other side. Foul gives them the points.',
              'Tap a name to change who is at the table, and Undo fixes any mistake.',
              'The frame clock starts on the first shot of each frame.',
            ]}
          />
        </>
      ) : null}

      {scoring ? (
        showManual ? (
          <Card>
            <ManualFrameForm teamALabel={labelA} teamBLabel={labelB} onSubmit={logManualFrame} />
            <Pressable onPress={() => setShowManual(false)} style={styles.linkRow}>
              <Text style={styles.linkMuted}>Cancel</Text>
            </Pressable>
          </Card>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowManual(true)}
            style={styles.linkRow}
          >
            <Text style={styles.linkMuted}>
              Not scoring ball by ball? Log a frame by final score
            </Text>
          </Pressable>
        )
      ) : null}

      {finished && s.summary ? (
        <MatchSummaryCard
          summary={s.summary}
          teamALabel={labelA}
          teamBLabel={labelB}
          nameOf={s.shortName}
        />
      ) : null}

      {finished && canScore && m.frames.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => void undo()} style={styles.linkRow}>
          <Text style={styles.link}>Undo last frame and keep playing</Text>
        </Pressable>
      ) : null}

      <SectionTitle title={m.frames.length > 0 ? `Frames (${m.frames.length})` : 'Frames'} />
      <MatchFrameList
        frames={m.frames}
        playerPoints={frameLines}
        teamALabel={labelA}
        teamBLabel={labelB}
        canEdit={canScore || s.canManage}
        onUpdate={(index, patch) =>
          run('Could not update the frame', () => matchService.updateFrame(m.id, index, patch))
        }
        onDelete={(index) =>
          run('Could not delete the frame', () => matchService.deleteFrame(m.id, index))
        }
        onClearTime={(index) =>
          run('Could not clear the time', () => matchService.clearFrameDuration(m.id, index))
        }
      />

      <View style={styles.options}>
        <MatchOptions
          match={m}
          inProgress={inProgress}
          canScore={canScore}
          canManage={s.canManage}
          members={s.memberPlayers}
          creatorUid={m.createdByUid}
          teamALabel={labelA}
          teamBLabel={labelB}
          busy={busy}
          onTitleMatch={(on) => void toggleTitle(on)}
          onPolicy={(policy, allowed) =>
            void run('Could not update scoring', () =>
              matchAdmin.setScoringPolicy(m.id, policy, allowed),
            )
          }
          onForfeit={(side) => void forfeit(side)}
          onDelete={() => void removeMatch()}
        />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: {
      gap: spacing.md,
    },
    loading: {
      marginTop: spacing.xxl,
    },
    topBreak: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
    },
    ranksCard: {
      padding: spacing.sm,
      gap: 4,
    },
    banner: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.info,
      textAlign: 'center',
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: c.card,
    },
    linkRow: {
      minHeight: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    link: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.primary,
      textAlign: 'center',
    },
    linkMuted: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    options: {
      marginTop: spacing.sm,
    },
  });
