import { router, useNavigation } from 'expo-router';
import { useLayoutEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GroupFrameEndRow } from '@/features/group/components/GroupFrameEndRow';
import { GroupLiveBoard } from '@/features/group/components/GroupLiveBoard';
import { GroupResult } from '@/features/group/components/GroupResult';
import { useGroupMatch } from '@/features/group/hooks/use-group-match';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { freeForAllRules } from '@/features/rules/services/rules';
import { LiveScoreboard } from '@/features/match/components/LiveScoreboard';
import { haptic } from '@/shared/feedback/haptics';
import { useLayout } from '@/shared/hooks/use-layout';
import { useLiveElapsed } from '@/shared/hooks/use-live-elapsed';
import { Button } from '@/shared/ui/Button';
import { ClockPill } from '@/shared/ui/ClockPill';
import { EmptyState } from '@/shared/ui/EmptyState';
import { PlayingOrderTiles } from '@/shared/ui/PlayingOrderTiles';
import { Screen } from '@/shared/ui/Screen';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

/** Live scoring and result of a free-for-all match (3 to 8 players, each for themselves). */
export function GroupMatchScreen({ groupId }: { groupId: string | undefined }): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { scale } = useLayout();
  const { group, shortName, fullName, standings, live, canManage, busy, actions } =
    useGroupMatch(groupId);

  // Rules and the frame clock sit on the right of the screen header, as in a two-sided match.
  // The clock starts on the frame's first shot.
  const navigation = useNavigation();
  const frameLive = group?.status === 'in_progress' && group.openFrame != null;
  const frameStart = group?.openFrame?.startedAt ?? null;
  const elapsed = useLiveElapsed(frameStart, frameLive);
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
                  <ClockPill seconds={elapsed} pending={frameStart === null} label="Frame time" />
                ) : null}
              </View>
            ),
    });
  }, [navigation, bestOf, frameLive, elapsed, frameStart, styles]);

  if (group === undefined) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
          <Text style={typography.subtitle}>Loading match…</Text>
        </View>
      </Screen>
    );
  }
  if (group === null) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title="Match not found"
          message="It may have been deleted."
          actionLabel="Go home"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const frameNumber = group.frames.length + 1;
  const inProgress = live != null;

  async function endFrame(winnerId: string): Promise<void> {
    if (!live) {
      return;
    }
    const line = group!.turnOrder.map((id) => `${shortName(id)} ${live.points[id] ?? 0}`);
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

  return (
    <Screen
      footer={
        !inProgress && group.frames.length > 0 && canManage ? (
          <Button
            label="Reopen last frame"
            icon="arrow-undo"
            variant="secondary"
            loading={busy}
            onPress={() => void reopen()}
          />
        ) : undefined
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={typography.label} numberOfLines={1}>
            {group.namedLabel ?? `Free-for-all · ${group.playerIds.length} players`}
          </Text>
          <Text style={[styles.title, { fontSize: scale(24) }]} numberOfLines={1}>
            {inProgress
              ? `Frame ${Math.min(frameNumber, group.bestOf)} of ${group.bestOf}`
              : 'Final'}
          </Text>
        </View>
        <View style={[styles.statusPill, !inProgress && styles.statusPillDone]}>
          {inProgress ? <View style={styles.liveDot} /> : null}
          <Text style={[styles.statusText, !inProgress && styles.statusTextDone]}>
            {inProgress ? 'Live' : 'Finished'}
          </Text>
        </View>
      </View>

      {live ? (
        <>
          <View style={styles.tables}>
            <PlayingOrderTiles
              tiles={group.turnOrder.map((id) => ({
                id,
                name: shortName(id),
                points: live.points[id] ?? 0,
              }))}
              atTableId={live.atTablePlayerId}
              currentBreak={live.currentBreak}
              onSelect={actions.selectPlayer}
            />
            <GroupLiveBoard
              seatOrder={group.turnOrder}
              points={live.points}
              foulPoints={live.foulPoints}
              standings={standings}
              nameOf={shortName}
            />
          </View>
          <LiveScoreboard
            table={live.table}
            deficit={live.deficit}
            canUndo={(group.openFrame?.shots.length ?? 0) > 0 || group.frames.length > 0}
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
        </>
      ) : (
        <GroupResult
          winnerId={group.winnerId}
          standings={standings}
          frames={group.frames}
          nameOf={fullName}
        />
      )}

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
    // Playing order on top, ranked leaderboard below, as in the two-sided match.
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    tables: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxl,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.display,
      color: c.text,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: c.cardRaised,
    },
    statusPillDone: {
      backgroundColor: c.successSoft,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    statusText: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.text,
    },
    statusTextDone: {
      color: c.success,
    },
    deleteLink: {
      alignSelf: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    deleteText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: c.danger,
    },
    pressed: {
      opacity: 0.7,
    },
  });
