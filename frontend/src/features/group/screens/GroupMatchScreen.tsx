import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GroupFrameEndRow } from '@/features/group/components/GroupFrameEndRow';
import { GroupLiveBoard } from '@/features/group/components/GroupLiveBoard';
import { GroupResult, groupWinReasonText } from '@/features/group/components/GroupResult';
import { useGroupMatch } from '@/features/group/hooks/use-group-match';
import { groupResultView } from '@/features/group/services/group-result';
import { LiveScoreboard } from '@/features/match/components/LiveScoreboard';
import { FinishedGame } from '@/features/result/components/FinishedGame';
import { PublicResultScreen } from '@/features/result/components/PublicResultScreen';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { freeForAllRules } from '@/features/rules/services/rules';
import { haptic } from '@/shared/feedback/haptics';
import { useKeepScreenOn } from '@/shared/hooks/use-keep-screen-on';
import { Button } from '@/shared/ui/Button';
import { ClockPill } from '@/shared/ui/ClockPill';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LiveGameHeader } from '@/shared/ui/LiveGameHeader';
import { LoadingState } from '@/shared/ui/LoadingState';
import { PlayingOrderTiles } from '@/shared/ui/PlayingOrderTiles';
import { Screen } from '@/shared/ui/Screen';
import { confirmAction } from '@/shared/utils/confirm';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

/** Live scoring and result of a free-for-all match (3 to 8 players, each for themselves). */
export function GroupMatchScreen({ groupId }: { groupId: string | undefined }): ReactNode {
  const styles = useStyles(makeStyles);
  const { group, load, shortName, fullName, standings, live, canManage, busy, actions } =
    useGroupMatch(groupId);

  // Rules and the frame clock sit on the right of the screen header, as in a two-sided match.
  // The clock starts on the frame's first shot.
  const navigation = useNavigation();
  const frameLive = group?.status === 'in_progress' && group.openFrame != null;
  const frameStart = group?.openFrame?.startedAt ?? null;
  useKeepScreenOn(frameLive, 'group-scoring');
  const bestOf = group?.bestOf ?? null;
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        bestOf === null
          ? undefined
          : () => (
              <View style={styles.headerRight}>
                <RulesButton iconOnly rules={freeForAllRules(bestOf)} />
                {frameLive ? (
                  <ClockPill startedAt={frameStart} running={frameLive} label="Frame time" />
                ) : null}
              </View>
            ),
    });
  }, [navigation, bestOf, frameLive, frameStart, styles]);

  if (group === undefined) {
    return (
      <Screen>
        {load.status === 'error' ? (
          <ErrorState title="Couldn't load this match" onRetry={load.retry} />
        ) : (
          <LoadingState label="Loading match" />
        )}
      </Screen>
    );
  }
  if (group === null) {
    // Not on this phone: a shared link from another league, or not synced yet.
    return <PublicResultScreen kind="group" id={groupId} />;
  }

  const g = group;
  const frameNumber = g.frames.length + 1;

  async function endFrame(winnerId: string): Promise<void> {
    if (!live) {
      return;
    }
    const line = g.turnOrder.map((id) => `${shortName(id)} ${live.points[id] ?? 0}`);
    const ok = await confirmAction(
      `Frame to ${fullName(winnerId)}?`,
      `End frame ${frameNumber} at ${line.join(', ')}. You can undo this.`,
      'End frame',
    );
    if (ok && (await actions.endFrame(winnerId))) {
      haptic('success');
    }
  }

  async function reopen(): Promise<void> {
    const ok = await confirmAction(
      'Reopen the last frame?',
      'The result is taken back and the last frame carries on from its final shot.',
      'Reopen',
    );
    if (ok) {
      await actions.undo();
    }
  }

  async function remove(): Promise<void> {
    const ok = await confirmAction(
      'Delete this match?',
      'All its frames are removed for everyone. This cannot be undone.',
      'Delete',
    );
    if (ok && (await actions.remove())) {
      router.replace('/');
    }
  }

  const result = groupResultView(g, standings, fullName);
  if (result || !live) {
    return (
      <Screen>
        {result ? (
          <FinishedGame
            view={result}
            detail={groupWinReasonText(standings, g.winnerId)}
            details={
              <GroupResult
                winnerId={g.winnerId}
                standings={standings}
                frames={g.frames}
                nameOf={fullName}
              />
            }
            more={
              canManage
                ? (afterClose) => (
                    <View style={styles.moreButtons}>
                      {g.frames.length > 0 ? (
                        <Button
                          label="Reopen last frame"
                          icon="arrow-undo"
                          variant="secondary"
                          loading={busy}
                          onPress={() => afterClose(() => void reopen())}
                        />
                      ) : null}
                      <Button
                        label="Delete match"
                        icon="trash-outline"
                        variant="danger"
                        onPress={() => afterClose(() => void remove())}
                      />
                    </View>
                  )
                : null
            }
          />
        ) : (
          // Live but between frames (no frame open): the table so far.
          <GroupResult
            winnerId={g.winnerId}
            standings={standings}
            frames={g.frames}
            nameOf={fullName}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <LiveGameHeader
        label={g.namedLabel ?? `Free-for-all · ${g.playerIds.length} players`}
        title={`Frame ${Math.min(frameNumber, g.bestOf)} of ${g.bestOf}`}
      />
      <View style={styles.tables}>
        <PlayingOrderTiles
          tiles={g.turnOrder.map((id) => ({
            id,
            name: shortName(id),
            points: live.points[id] ?? 0,
          }))}
          atTableId={live.atTablePlayerId}
          currentBreak={live.currentBreak}
          onSelect={actions.selectPlayer}
        />
        <GroupLiveBoard
          seatOrder={g.turnOrder}
          points={live.points}
          foulPoints={live.foulPoints}
          standings={standings}
          nameOf={shortName}
        />
      </View>
      <LiveScoreboard
        table={live.table}
        deficit={live.deficit}
        canUndo={(g.openFrame?.shots.length ?? 0) > 0 || g.frames.length > 0}
        onPot={actions.pot}
        onFoul={actions.foul}
        onEndVisit={actions.endVisit}
        onFreeBall={actions.freeBall}
        onUndo={() => void actions.undo()}
        foulLabel={(pts) =>
          `Foul ${pts}: taken off ${shortName(live.atTablePlayerId)}, any shortfall to everyone else`
        }
        frameRow={
          <GroupFrameEndRow
            leaders={live.leaders}
            hasScore={Object.values(live.points).some((p) => p > 0)}
            disabled={busy}
            nameOf={shortName}
            onEndFrame={(id) => void endFrame(id)}
          />
        }
      />

      {canManage ? (
        <Pressable
          onPress={() => void remove()}
          accessibilityRole="button"
          style={({ pressed }) => [styles.deleteLink, pressed && styles.pressed]}
        >
          <Text style={styles.deleteText}>Delete match</Text>
        </Pressable>
      ) : null}
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
    // Playing order on top, ranked leaderboard below, as in the two-sided match.
    tables: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    moreButtons: {
      gap: spacing.sm,
    },
    deleteLink: {
      alignSelf: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    deleteText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.danger,
    },
    pressed: {
      opacity: 0.7,
    },
  });
