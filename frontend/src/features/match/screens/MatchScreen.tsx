import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { maybeAskForRating } from '@/features/home/services/rating-prompt.service';
import { FrameLeaderStrip } from '@/features/match/components/FrameLeaderStrip';
import type { FrameRankView } from '@/features/match/components/FrameLiveRanks';
import { LiveScoreboard } from '@/features/match/components/LiveScoreboard';
import { MatchConfirmBanner } from '@/features/match/components/MatchConfirmBanner';
import { MatchFramesSheet } from '@/features/match/components/MatchFramesSheet';
import { MatchMoreSheet } from '@/features/match/components/MatchMoreSheet';
import { MatchScoreHeader, type ScoreSideView } from '@/features/match/components/MatchScoreHeader';
import { MatchTimingHeader } from '@/features/match/components/MatchTimingHeader';
import { MidwaySetup } from '@/features/match/components/MidwaySetup';
import { ScoringStatus } from '@/features/match/components/ScoringStatus';
import { useMatchActions } from '@/features/match/hooks/use-match-actions';
import { matchAdmin, matchService, useMatchScreen } from '@/features/match/hooks/use-match-screen';
import { matchResultView } from '@/features/match/services/match-result';
import { summarizeMatch } from '@/features/match/services/match-summary';
import { PublicResultScreen } from '@/features/result/components/PublicResultScreen';
import { ResultActionBar, type ResultAction } from '@/features/result/components/ResultActionBar';
import { ResultCelebration } from '@/features/result/components/ResultCelebration';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { matchRules } from '@/features/rules/services/rules';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { useKeepScreenOn } from '@/shared/hooks/use-keep-screen-on';
import { Card } from '@/shared/ui/Card';
import { HeaderBack, useSafeBack } from '@/shared/ui/HeaderBack';
import { LoadingState } from '@/shared/ui/LoadingState';
import { notify } from '@/shared/ui/notify';
import { Screen } from '@/shared/ui/Screen';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

interface MatchScreenProps {
  matchId: string | undefined;
  /** Opened from "New match" with "We are already mid-match" switched on. */
  startMidway: boolean;
}

/** A two-sided match: live scoring while it is played, the shared result card once over. */
export function MatchScreen({ matchId, startMidway }: MatchScreenProps): ReactNode {
  const navigation = useNavigation();
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const s = useMatchScreen(matchId);
  const { match, run, canScore, busy, shortName } = s;
  const goBack = useSafeBack('/(main)');
  const actions = useMatchActions(match, s, goBack);
  const [showFrames, setShowFrames] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showMidway, setShowMidway] = useState(startMidway);
  const { user } = useSession();

  const inProgress = match?.outcome.status === 'in_progress';
  const timingOn = match?.timingEnabled === true;
  const frameStartedAt = match?.frameStartedAt ?? null;
  const id = match?.id;

  // After a win or a century, maybe ask for a store rating (once per finished match here;
  // the service limits it to once every 90 days).
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!match || match.outcome.status === 'in_progress' || askedFor.current === match.id) {
      return;
    }
    askedFor.current = match.id;
    const mine = s.players.find((p) => p.authUid != null && p.authUid === user?.uid)?.id ?? null;
    void maybeAskForRating(match, mine);
  }, [match, s.players, user?.uid]);
  // The phone must not dim or lock between shots while someone is scoring here.
  useKeepScreenOn(inProgress && canScore, 'match-scoring');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: match ? match.namedLabel || (match.crownsChampion ? 'Title match' : 'Match') : 'Match',
      headerLeft: () => <HeaderBack fallback="/(main)" />,
      headerRight: match
        ? () => (
            <View style={styles.headerRight}>
              <RulesButton
                iconOnly
                rules={matchRules(
                  matchService.oddBestOf(match.bestOf),
                  matchService.matchFormatOf(match),
                )}
              />
              {inProgress && id ? (
                <MatchTimingHeader
                  enabled={timingOn}
                  startedAt={frameStartedAt}
                  disabled={busy || !canScore}
                  onToggle={(next) =>
                    void run('Could not change the timer', () =>
                      matchService.setMatchTiming(id, next),
                    )
                  }
                />
              ) : null}
            </View>
          )
        : undefined,
    });
  }, [navigation, match, id, inProgress, timingOn, frameStartedAt, busy, canScore, run, styles]);

  // The live frame's per-player points (short names).
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

  // Teach scoring before the first shot only, so it never interrupts a frame in play.
  const freshScoreboard =
    inProgress &&
    canScore &&
    !showMidway &&
    match?.frames.length === 0 &&
    match.openFrame != null &&
    match.openFrame.shots.length === 0;
  useAutoTour('live-scoring', freshScoreboard);

  if (match === undefined) {
    return (
      <Screen>
        <LoadingState label="Loading match" />
      </Screen>
    );
  }
  if (match === null) {
    // Not on this phone: a shared link from another league, or not synced yet.
    return <PublicResultScreen kind="match" id={matchId} />;
  }

  const m = match;
  const open = m.openFrame ?? null;
  const finished = !inProgress;
  const fullA = s.sideLabel('a');
  const fullB = s.sideLabel('b');
  const livePoints = new Map(liveRanks.map((r) => [r.playerId, r.scored]));
  const hbByPlayer = new Map(s.summary?.players.map((p) => [p.playerId, p.highestBreak]) ?? []);
  const result = matchResultView(m, { sideA: fullA, sideB: fullB });

  const sideView = (side: 'a' | 'b'): ScoreSideView => {
    const ids = side === 'a' ? m.teamA : m.teamB;
    const last = m.frames[m.frames.length - 1];
    const live = open ? (side === 'a' ? open.teamAPoints : open.teamBPoints) : null;
    const lastPts = side === 'a' ? (last?.teamAPoints ?? 0) : (last?.teamBPoints ?? 0);
    return {
      side,
      framePoints: live ?? lastPts,
      frames: side === 'a' ? m.outcome.framesA : m.outcome.framesB,
      players: ids.map((pid) => ({
        id: pid,
        name: shortName(pid),
        framePoints: livePoints.get(pid) ?? 0,
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
  // While scoring, the ball pad sits right under the score so logging needs no scrolling.
  const scoring = inProgress && canScore;
  const canStartMidway =
    scoring && m.frames.length === 0 && (open?.shots.length ?? 0) === 0 && !open?.carriedPoints;

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
  const topBreakLine =
    topBreak && topBreak.value > 0 ? (
      <Text style={styles.topBreak}>
        Highest break so far: {topBreak.value} by{' '}
        <Text style={{ color: sideColor(palette, topBreak.side) }}>
          {topBreak.playerId ? shortName(topBreak.playerId) : s.sideLabel(topBreak.side, true)}
        </Text>
      </Text>
    ) : null;

  // A rematch is offered to the people in this game (and whoever scored or runs it).
  const iPlayed = s.players.some(
    (p) =>
      p.authUid != null &&
      p.authUid === user?.uid &&
      (m.teamA.includes(p.id) || m.teamB.includes(p.id)),
  );
  const canRematch = result != null && (iPlayed || canScore || s.canManage);
  const barActions: ResultAction[] = [
    ...(canRematch
      ? [
          {
            key: 'rematch',
            label: 'Rematch',
            icon: 'refresh' as const,
            disabled: busy,
            onPress: () => void actions.rematch(),
          },
        ]
      : []),
    {
      key: 'frames',
      // Finished, the short label keeps four buttons on one line on the narrowest phones.
      label: !finished && m.frames.length > 0 ? `Frames (${m.frames.length})` : 'Frames',
      icon: 'list-outline',
      onPress: () => setShowFrames(true),
    },
    ...(canScore || s.canManage
      ? [
          {
            key: 'more',
            label: 'More',
            icon: 'ellipsis-horizontal' as const,
            onPress: () => setShowMore(true),
          },
        ]
      : []),
  ];

  return (
    <Screen contentStyle={styles.content}>
      {result ? (
        <ResultCelebration view={result} detail={matchService.describeForfeit(m, s.fullName)} />
      ) : null}
      <MatchConfirmBanner match={m} players={s.players} />

      {inProgress && !scoring ? scoringStatus : null}

      {inProgress ? (
        <TourTarget id="live.players">
          <MatchScoreHeader
            a={sideView('a')}
            b={sideView('b')}
            atTable={open ? open.atTable : null}
            atTablePlayerId={open?.atTablePlayerId ?? null}
            currentBreak={open?.currentBreak ?? 0}
            frameNumber={m.frames.length + 1}
            bestOf={matchService.oddBestOf(m.bestOf)}
            canSelectPlayer={canScore}
            onSelectPlayer={s.actions.selectPlayer}
          />
        </TourTarget>
      ) : null}

      {/* Shown from the first shot to the last, so the ball pad never jumps when play starts. */}
      {inProgress ? <FrameLeaderStrip ranks={liveRanks} layout="list" /> : null}

      {inProgress && !scoring ? topBreakLine : null}
      {inProgress && open?.carriedPoints ? (
        <Text style={styles.banner}>
          Ball-by-ball scoring started at {open.carriedPoints.a}-{open.carriedPoints.b} in this
          frame.
        </Text>
      ) : null}

      {canStartMidway && showMidway ? (
        <Card>
          <MidwaySetup
            teamALabel={s.sideLabel('a', true)}
            teamBLabel={s.sideLabel('b', true)}
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

      {scoring && open && s.table ? (
        <LiveScoreboard
          table={s.table}
          deficit={deficit}
          teamALabel={s.sideLabel('a', true)}
          teamBLabel={s.sideLabel('b', true)}
          canUndo={open.shots.length > 0 || m.frames.length > 0}
          onPot={s.actions.pot}
          onFoul={s.actions.foul}
          onEndVisit={s.actions.endVisit}
          onFreeBall={s.actions.freeBall}
          onUndo={() => void actions.undo()}
          onFrameWon={(winner) => void actions.awardFrame(winner)}
        />
      ) : null}

      {/* Everything secondary sits one tap away, so scoring and the result fit on one screen. */}
      <ResultActionBar view={result} actions={barActions} />

      <MatchFramesSheet
        visible={showFrames}
        onClose={() => setShowFrames(false)}
        match={m}
        s={s}
        topBreakLine={topBreakLine}
      />
      <MatchMoreSheet
        visible={showMore}
        onClose={() => setShowMore(false)}
        match={m}
        s={s}
        actions={actions}
        scoringStatus={scoringStatus}
        canStartMidway={canStartMidway && !showMidway}
        onStartMidway={() => setShowMidway(true)}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    content: {
      gap: spacing.md,
    },
    topBreak: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.body,
      color: c.text,
      textAlign: 'center',
    },
    banner: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.info,
      textAlign: 'center',
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: c.card,
    },
  });
