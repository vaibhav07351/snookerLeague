import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { useSession } from '@/features/auth/hooks/use-session';
import * as playersService from '@/features/players/services/players.service';
import { RaceBallPad } from '@/features/race/components/RaceBallPad';
import { RaceLiveBoard } from '@/features/race/components/RaceLiveBoard';
import {
  compareRaceBoard,
  currentRaceBreak,
  foulPointsOf,
  netRaceScore,
  raceDurationSeconds,
  raceShotSummary,
  raceStartedAt,
  withRaceDefaults,
  type RacePlayerShots,
} from '@/features/race/services/race-helpers';
import * as raceAdmin from '@/features/race/services/race-admin.service';
import * as raceLive from '@/features/race/services/race-live.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { raceRules } from '@/features/rules/services/rules';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useLayout } from '@/shared/hooks/use-layout';
import { useLiveElapsed } from '@/shared/hooks/use-live-elapsed';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player, Race, RacePlace } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { ClockPill } from '@/shared/ui/ClockPill';
import { PlayingOrderTiles } from '@/shared/ui/PlayingOrderTiles';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { confirmAction } from '@/shared/utils/confirm';
import { formatDuration } from '@/shared/utils/datetime';
import { shortNames } from '@/shared/utils/names';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

function formatRacePlace(place: RacePlace | null): string {
  if (place === null) {
    return '-';
  }
  if (place === 'dnf') {
    return "Didn't finish";
  }
  return `#${place}`;
}

/** "Best 40 · 3 reds · 2 misses · 4 safeties", leaving out what is zero; null when all are. */
function shotLine(shots: RacePlayerShots | undefined): string | null {
  if (!shots) {
    return null;
  }
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  const parts = [
    shots.bestBreak > 0 ? `Best ${shots.bestBreak}` : null,
    shots.reds > 0 ? plural(shots.reds, 'red', 'reds') : null,
    shots.misses > 0 ? plural(shots.misses, 'miss', 'misses') : null,
    shots.safeties > 0 ? plural(shots.safeties, 'safety', 'safeties') : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function RaceDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [race, setRace] = useState<Race | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { user } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { scale } = useLayout();

  const reload = useCallback(async () => {
    if (!id) {
      return;
    }
    const r = await raceService.getRace(id);
    setRace((prev) => {
      if (prev && r && prev.id === r.id && prev.updatedAt === r.updatedAt) {
        return prev;
      }
      return r ? withRaceDefaults(r) : r;
    });
    if (r) {
      setPlayers(await playersService.listPlayers(r.leagueId));
      setDraftScores((prev) => {
        const drafts: Record<string, string> = {};
        let same = true;
        r.entrants.forEach((e) => {
          const next = e.score === 0 ? '' : String(e.score);
          drafts[e.playerId] = next;
          if (prev[e.playerId] !== next) {
            same = false;
          }
        });
        if (same && Object.keys(prev).length === Object.keys(drafts).length) {
          return prev;
        }
        // Preserve in-progress typing when server scores are still zero / unchanged keys.
        if (Object.keys(prev).length > 0 && r.entrants.every((e) => e.score === 0)) {
          return prev;
        }
        return drafts;
      });
    }
  }, [id]);

  useStoreReload(reload, id ?? null);

  // The race clock starts on the first shot, like a match frame.
  const clockStart = race ? raceStartedAt(race) : null;
  const racing = race?.status === 'in_progress';
  const elapsed = useLiveElapsed(clockStart, racing);
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
                  <ClockPill seconds={elapsed} pending={clockStart === null} label="Race time" />
                ) : null}
              </View>
            ),
    });
  }, [navigation, targetScore, racing, elapsed, clockStart, styles]);

  if (!race) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.primary} />
          <Text style={typography.subtitle}>Loading race…</Text>
        </View>
      </Screen>
    );
  }

  const nameOf = (pid: string): string =>
    players.find((p) => p.id === pid)?.displayName ?? 'Player';
  // Live board and ball pad are tight: first names, surnames only when first names clash.
  const compactNames = shortNames(
    race.entrants.map((e) => ({ id: e.playerId, name: nameOf(e.playerId) })),
  );
  const shortNameOf = (pid: string): string => compactNames[pid] ?? nameOf(pid);
  const inProgress = race.status === 'in_progress';
  const canManage = raceAdmin.canManageRace(race, user?.uid);
  const finishedSeconds = raceDurationSeconds(race);

  const activeIds = race.entrants.filter((e) => e.place === null).map((e) => e.playerId);
  const scoringId =
    race.atTablePlayerId && activeIds.includes(race.atTablePlayerId)
      ? race.atTablePlayerId
      : (activeIds[0] ?? null);
  const visitBreak = currentRaceBreak(race.liveShots, scoringId);

  const sorted = [...race.entrants].sort(compareRaceBoard);
  const shotsByPlayer = raceShotSummary(race.liveShots);
  // Table order learned from the scorer's picks; anyone not in it yet follows in entry order.
  const seats = race.turnOrder ?? [];
  const playingOrder = [
    ...seats.flatMap((pid) => race.entrants.filter((e) => e.playerId === pid)),
    ...race.entrants.filter((e) => !seats.includes(e.playerId)),
  ];
  const scoreLine = (e: Race['entrants'][number]): string =>
    foulPointsOf(e) > 0
      ? `Score ${netRaceScore(e)} (${e.score} potted, ${foulPointsOf(e)} in fouls)`
      : `Score ${netRaceScore(e)}`;

  function alertLive(error: unknown): void {
    notify.error('Could not record', toUserMessage(error));
  }

  async function saveScore(playerId: string): Promise<void> {
    try {
      const raw = draftScores[playerId] ?? '';
      const score = raw.trim() === '' ? 0 : Number(raw) || 0;
      await raceService.setEntrantScore(race!.id, playerId, score);
    } catch (error) {
      notify.error('Could not update score', toUserMessage(error));
    }
  }

  async function markDidntFinish(playerId: string, playerName: string): Promise<void> {
    const ok = await confirmAction(
      "Mark as didn't finish?",
      `${playerName} drops out and takes last place, which still counts in ratings. You can undo while the race is still in progress.`,
      "Didn't finish",
    );
    if (!ok) {
      return;
    }
    setBusyPlayerId(playerId);
    try {
      await raceService.markDnf(race!.id, playerId);
    } catch (error) {
      notify.error("Could not mark didn't finish", toUserMessage(error));
    } finally {
      setBusyPlayerId(null);
    }
  }

  // The button is pinned on screen the whole race, so a stray tap must not end it.
  async function completeRace(): Promise<void> {
    const ok = await confirmAction(
      'Complete the race?',
      'Players still playing are placed by score after fouls. If level, fewer fouls goes ahead.',
      'Complete race',
    );
    if (!ok) {
      return;
    }
    try {
      await raceService.completeRace(race!.id);
    } catch (error) {
      notify.error('Could not complete', toUserMessage(error));
    }
  }

  async function undoDidntFinish(playerId: string): Promise<void> {
    setBusyPlayerId(playerId);
    try {
      await raceService.undoDnf(race!.id, playerId);
    } catch (error) {
      notify.error('Could not undo', toUserMessage(error));
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function removeRace(): Promise<void> {
    const ok = await confirmAction(
      inProgress ? 'Abandon and delete this race?' : 'Delete this race?',
      'It is removed for everyone, and stats and the race king are worked out again without it. This cannot be undone.',
      'Delete',
    );
    if (!ok) {
      return;
    }
    setDeleting(true);
    try {
      await raceAdmin.deleteRace(race!.id);
      router.replace('/');
    } catch (error) {
      notify.error('Could not delete the race', toUserMessage(error));
      setDeleting(false);
    }
  }

  const showStandings = !inProgress || scoresOpen;

  return (
    <Screen
      footer={
        inProgress ? (
          <Button label="Complete race" icon="flag" onPress={() => void completeRace()} />
        ) : undefined
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          {race.namedLabel ? (
            <Text style={typography.label} numberOfLines={1}>
              {race.namedLabel}
            </Text>
          ) : null}
          <Text style={[styles.target, { fontSize: scale(26) }]} numberOfLines={1}>
            Race to {race.targetScore}
          </Text>
          {finishedSeconds !== null ? (
            <Text style={styles.timeMeta}>
              Time at the table: {formatDuration(finishedSeconds)}
            </Text>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          {race.crownsRaceChampion ? (
            <View style={styles.crownPill} accessibilityLabel="Crowns race king">
              <Ionicons name="trophy" size={12} color={palette.primary} />
            </View>
          ) : null}
          <View style={[styles.statusPill, !inProgress && styles.statusPillDone]}>
            {inProgress ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.statusText, !inProgress && styles.statusTextDone]}>
              {race.status === 'completed' ? 'Finished' : 'Live'}
            </Text>
          </View>
        </View>
      </View>

      {/* Playing order on top, ranked leaderboard below, as in the two-sided match. */}
      <View style={styles.tables}>
        {race.status === 'in_progress' ? (
          <PlayingOrderTiles
            tiles={playingOrder.map((e) => ({
              id: e.playerId,
              name: shortNameOf(e.playerId),
              points: netRaceScore(e),
              disabled: e.place !== null,
            }))}
            atTableId={scoringId}
            currentBreak={visitBreak}
            onSelect={(playerId) => {
              void raceLive.setAtTablePlayer(race.id, playerId).catch(alertLive);
            }}
          />
        ) : null}
        <RaceLiveBoard race={race} nameOf={shortNameOf} />
      </View>

      {race.status === 'in_progress' ? (
        <RaceBallPad
          playerName={scoringId ? shortNameOf(scoringId) : null}
          currentBreak={visitBreak}
          canUndo={(race.liveShots?.length ?? 0) > 0}
          onPot={(ball) => {
            void raceLive.recordPot(race.id, ball).catch(alertLive);
          }}
          onFoul={(points) => {
            void raceLive.recordFoul(race.id, points).catch(alertLive);
          }}
          onMiss={() => {
            void raceLive.recordMiss(race.id).catch(alertLive);
          }}
          onSafety={() => {
            void raceLive.recordSafety(race.id).catch(alertLive);
          }}
          onUndo={() => {
            void raceLive.undoLast(race.id).catch(alertLive);
          }}
        />
      ) : null}

      {inProgress ? (
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
      ) : (
        <SectionTitle title="Final standings" />
      )}

      {showStandings ? (
        <Card style={styles.list}>
          {sorted.map((e, index) => {
            const playerName = nameOf(e.playerId);
            const busy = busyPlayerId === e.playerId;
            const shots = inProgress ? null : shotLine(shotsByPlayer[e.playerId]);
            return (
              <View key={e.playerId} style={[styles.row, index > 0 && styles.rowDivider]}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>
                    {playerName}
                  </Text>
                  <Text style={[styles.place, e.place === 'dnf' && styles.placeOut]}>
                    {formatRacePlace(e.place)}
                  </Text>
                </View>
                {race.status === 'in_progress' && e.place === null ? (
                  <View style={styles.scoreEdit}>
                    <View style={styles.scoreField}>
                      <TextField
                        label="Potted points"
                        value={draftScores[e.playerId] ?? ''}
                        onChangeText={(t) =>
                          setDraftScores((prev) => ({ ...prev, [e.playerId]: t }))
                        }
                        keyboardType="number-pad"
                        placeholder="Tap to type"
                      />
                    </View>
                    <Button
                      label="Save"
                      variant="secondary"
                      onPress={() => void saveScore(e.playerId)}
                      style={styles.save}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${playerName} as didn't finish`}
                      disabled={busy}
                      onPress={() => void markDidntFinish(e.playerId, playerName)}
                      style={styles.outLink}
                    >
                      <Text style={styles.outLinkText}>{busy ? '…' : 'Out'}</Text>
                    </Pressable>
                  </View>
                ) : race.status === 'in_progress' && e.place === 'dnf' ? (
                  <View style={styles.outRow}>
                    <Text style={styles.finalScore}>{scoreLine(e)}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Undo didn't finish for ${playerName}`}
                      disabled={busy}
                      onPress={() => void undoDidntFinish(e.playerId)}
                      style={styles.outLink}
                    >
                      <Text style={styles.undoLinkText}>{busy ? '…' : 'Undo'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.finalScore}>{scoreLine(e)}</Text>
                )}
                {shots ? <Text style={styles.shotLine}>{shots}</Text> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Live races keep it behind the expander, so a stray tap mid-race cannot reach it. */}
      {canManage && showStandings ? (
        <Pressable
          onPress={() => void removeRace()}
          disabled={deleting}
          accessibilityRole="button"
          style={({ pressed }) => [styles.deleteLink, pressed && styles.deletePressed]}
        >
          <Text style={styles.deleteText}>
            {deleting ? 'Deleting...' : inProgress ? 'Abandon and delete race' : 'Delete race'}
          </Text>
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
    tables: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
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
      fontSize: 13,
      color: c.textMuted,
    },
    target: {
      fontFamily: fonts.display,
      color: c.text,
    },
    metaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.live,
    },
    statusPillDone: {
      borderColor: c.border,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    statusText: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 12,
    },
    statusTextDone: {
      color: c.textMuted,
    },
    crownPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
    },
    list: {
      paddingVertical: spacing.xs,
      gap: 0,
    },
    row: {
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: 28,
    },
    name: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    place: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 14,
    },
    placeOut: {
      color: c.danger,
    },
    scoreEdit: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    scoreField: {
      flex: 1,
      minWidth: 0,
    },
    save: {
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 52,
    },
    outLink: {
      minHeight: 52,
      minWidth: TOUCH_TARGET,
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outLinkText: {
      fontFamily: fonts.bodyBold,
      color: c.danger,
      fontSize: 14,
    },
    outRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    undoLinkText: {
      fontFamily: fonts.bodyBold,
      color: c.info,
      fontSize: 14,
    },
    timeMeta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    finalScore: {
      fontFamily: fonts.body,
      color: c.textMuted,
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
      fontSize: 13,
      color: c.danger,
    },
    deletePressed: {
      opacity: 0.7,
    },
    shotLine: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textFaint,
    },
  });
