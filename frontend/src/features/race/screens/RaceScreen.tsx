import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FinishedGame } from '@/features/result/components/FinishedGame';
import { PublicResultScreen } from '@/features/result/components/PublicResultScreen';
import { RaceBallPad } from '@/features/race/components/RaceBallPad';
import { RaceLiveBoard } from '@/features/race/components/RaceLiveBoard';
import { RaceStandingsCard } from '@/features/race/components/RaceStandingsCard';
import { useRaceScreen } from '@/features/race/hooks/use-race-screen';
import {
  currentRaceBreak,
  netRaceScore,
  raceDurationSeconds,
  raceStartedAt,
} from '@/features/race/services/race-helpers';
import { raceResultView } from '@/features/race/services/race-result';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { raceRules } from '@/features/rules/services/rules';
import { useKeepScreenOn } from '@/shared/hooks/use-keep-screen-on';
import { Button } from '@/shared/ui/Button';
import { ClockPill } from '@/shared/ui/ClockPill';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LiveGameHeader } from '@/shared/ui/LiveGameHeader';
import { LoadingState } from '@/shared/ui/LoadingState';
import { PlayingOrderTiles } from '@/shared/ui/PlayingOrderTiles';
import { Screen } from '@/shared/ui/Screen';
import { formatDuration } from '@/shared/utils/datetime';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, TOUCH_TARGET, typeScale, type Palette } from '@/theme/tokens';

/** A race: live scoring while it is played, the shared result card once over. */
export function RaceScreen({ raceId }: { raceId: string | undefined }): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const s = useRaceScreen(raceId);
  const { race, nameOf, shortNameOf } = s;
  const [scoresOpen, setScoresOpen] = useState(false);

  // The race clock starts on the first shot, like a match frame.
  const clockStart = race ? raceStartedAt(race) : null;
  const racing = race?.status === 'in_progress';
  // Any member can score a live race, so the screen stays on while it is live.
  useKeepScreenOn(racing, 'race-scoring');
  const navigation = useNavigation();
  const targetScore = race?.targetScore ?? null;
  // Rules and the live clock sit on the right of the screen header, as in a two-sided match.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        targetScore === null
          ? undefined
          : () => (
              <View style={styles.headerRight}>
                <RulesButton iconOnly rules={raceRules(targetScore)} />
                {racing ? (
                  <ClockPill startedAt={clockStart} running={racing} label="Race time" />
                ) : null}
              </View>
            ),
    });
  }, [navigation, targetScore, racing, clockStart, styles]);

  if (race === undefined) {
    return (
      <Screen>
        {s.load.status === 'error' ? (
          <ErrorState title="Couldn't load this race" onRetry={s.load.retry} />
        ) : (
          <LoadingState label="Loading race" />
        )}
      </Screen>
    );
  }
  if (race === null) {
    // Not on this phone: a shared link from another league, or not synced yet.
    return <PublicResultScreen kind="race" id={raceId} />;
  }

  const result = raceResultView(race, nameOf);
  if (result) {
    const seconds = raceDurationSeconds(race);
    return (
      <Screen>
        <FinishedGame
          view={result}
          details={
            <>
              {seconds !== null ? (
                <Text style={styles.timeMeta}>Time at the table: {formatDuration(seconds)}</Text>
              ) : null}
              <RaceStandingsCard race={race} nameOf={nameOf} />
            </>
          }
          more={
            s.canManage
              ? (afterClose) => (
                  <Button
                    label={s.deleting ? 'Deleting...' : 'Delete race'}
                    icon="trash-outline"
                    variant="danger"
                    disabled={s.deleting}
                    onPress={() => afterClose(() => void s.remove())}
                  />
                )
              : null
          }
        />
      </Screen>
    );
  }

  const activeIds = race.entrants.filter((e) => e.place === null).map((e) => e.playerId);
  const scoringId =
    race.atTablePlayerId && activeIds.includes(race.atTablePlayerId)
      ? race.atTablePlayerId
      : (activeIds[0] ?? null);
  const visitBreak = currentRaceBreak(race.liveShots, scoringId);
  // Table order learned from the scorer's picks; anyone not in it yet follows in entry order.
  const seats = race.turnOrder ?? [];
  const playingOrder = [
    ...seats.flatMap((pid) => race.entrants.filter((e) => e.playerId === pid)),
    ...race.entrants.filter((e) => !seats.includes(e.playerId)),
  ];

  return (
    <Screen footer={<Button label="Complete race" icon="flag" onPress={() => void s.complete()} />}>
      <LiveGameHeader
        label={race.namedLabel}
        title={`Race to ${race.targetScore}`}
        crown={race.crownsRaceChampion}
      />

      {/* Playing order on top, ranked leaderboard below, as in the two-sided match. */}
      <View style={styles.tables}>
        <PlayingOrderTiles
          tiles={playingOrder.map((e) => ({
            id: e.playerId,
            name: shortNameOf(e.playerId),
            points: netRaceScore(e),
            disabled: e.place !== null,
          }))}
          atTableId={scoringId}
          currentBreak={visitBreak}
          onSelect={s.live.selectPlayer}
        />
        <RaceLiveBoard race={race} nameOf={shortNameOf} />
      </View>

      <RaceBallPad
        playerName={scoringId ? shortNameOf(scoringId) : null}
        currentBreak={visitBreak}
        canUndo={(race.liveShots?.length ?? 0) > 0}
        onPot={s.live.pot}
        onFoul={s.live.foul}
        onMiss={s.live.miss}
        onSafety={s.live.safety}
        onUndo={s.live.undo}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: scoresOpen }}
        onPress={() => setScoresOpen((v) => !v)}
        style={styles.expander}
      >
        <Text style={styles.expanderText}>Set final scores or mark someone out</Text>
        <Ionicons
          name={scoresOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={palette.textMuted}
        />
      </Pressable>

      {scoresOpen ? (
        <>
          <RaceStandingsCard
            race={race}
            nameOf={nameOf}
            edit={{
              busyPlayerId: s.busyPlayerId,
              onSave: (pid, score) => void s.setScore(pid, score),
              onOut: (pid) => void s.markDidntFinish(pid),
              onUndoOut: (pid) => void s.undoDidntFinish(pid),
            }}
          />
          {/* Behind the expander, so a stray tap mid-race cannot reach it. */}
          {s.canManage ? (
            <Pressable
              onPress={() => void s.remove()}
              disabled={s.deleting}
              accessibilityRole="button"
              style={({ pressed }) => [styles.deleteLink, pressed && styles.deletePressed]}
            >
              <Text style={styles.deleteText}>
                {s.deleting ? 'Deleting...' : 'Abandon and delete race'}
              </Text>
            </Pressable>
          ) : null}
        </>
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
    tables: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    expander: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 44,
      marginTop: spacing.sm,
    },
    expanderText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.textMuted,
    },
    timeMeta: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    deleteLink: {
      alignSelf: 'center',
      minHeight: TOUCH_TARGET,
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    deleteText: {
      fontFamily: fonts.bodyMedium,
      fontSize: typeScale.small,
      color: c.danger,
    },
    deletePressed: {
      opacity: 0.7,
    },
  });
