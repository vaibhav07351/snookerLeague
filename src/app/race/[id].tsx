import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import { RaceBallPad } from '@/features/race/components/RaceBallPad';
import { RaceLiveBoard } from '@/features/race/components/RaceLiveBoard';
import { currentRaceBreak, withRaceDefaults } from '@/features/race/services/race-helpers';
import * as raceLive from '@/features/race/services/race-live.service';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useLayout } from '@/shared/hooks/use-layout';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player, Race, RacePlace } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { confirmAction } from '@/shared/utils/confirm';
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

export default function RaceDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [race, setRace] = useState<Race | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [busyPlayerId, setBusyPlayerId] = useState<string | null>(null);
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

  const activeIds = race.entrants.filter((e) => e.place === null).map((e) => e.playerId);
  const scoringId =
    race.atTablePlayerId && activeIds.includes(race.atTablePlayerId)
      ? race.atTablePlayerId
      : (activeIds[0] ?? null);
  const visitBreak = currentRaceBreak(race.liveShots, scoringId);

  const sorted = [...race.entrants].sort((a, b) => {
    const placeA = a.place === null ? 999 : a.place === 'dnf' ? 998 : a.place;
    const placeB = b.place === null ? 999 : b.place === 'dnf' ? 998 : b.place;
    if (placeA !== placeB) {
      return placeA - placeB;
    }
    return b.score - a.score;
  });

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
      `${playerName} will drop out of this race. You can undo while the race is still in progress.`,
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

  return (
    <Screen>
      <View style={styles.header}>
        {race.namedLabel ? (
          <Text style={typography.label} numberOfLines={1}>
            {race.namedLabel}
          </Text>
        ) : null}
        <Text style={[styles.target, { fontSize: scale(32) }]}>Race to {race.targetScore}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.statusPill, !inProgress && styles.statusPillDone]}>
            {inProgress ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.statusText, !inProgress && styles.statusTextDone]}>
              {race.status === 'completed' ? 'Finished' : 'In progress'}
            </Text>
          </View>
          {race.crownsRaceChampion ? (
            <View style={styles.crownPill}>
              <Ionicons name="trophy" size={12} color={palette.primary} />
              <Text style={styles.crownText}>Crowns race king</Text>
            </View>
          ) : null}
        </View>
      </View>

      <RaceLiveBoard
        race={race}
        nameOf={shortNameOf}
        selectedPlayerId={race.status === 'in_progress' ? scoringId : null}
        onSelectPlayer={
          race.status === 'in_progress'
            ? (playerId) => {
                void raceLive.setAtTablePlayer(race.id, playerId).catch(alertLive);
              }
            : undefined
        }
      />

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
          onUndo={() => {
            void raceLive.undoLast(race.id).catch(alertLive);
          }}
        />
      ) : null}

      <SectionTitle title={inProgress ? 'Or set final scores' : 'Final standings'} />

      <Card style={styles.list}>
        {sorted.map((e, index) => {
          const playerName = nameOf(e.playerId);
          const busy = busyPlayerId === e.playerId;
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
                      label="Set score"
                      value={draftScores[e.playerId] ?? ''}
                      onChangeText={(t) => setDraftScores((prev) => ({ ...prev, [e.playerId]: t }))}
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
                  <Text style={styles.finalScore}>Score {e.score}</Text>
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
                <Text style={styles.finalScore}>Score {e.score}</Text>
              )}
            </View>
          );
        })}
      </Card>

      {inProgress ? (
        <Button
          label="Complete race"
          icon="flag"
          onPress={() => {
            void raceService.completeRace(race.id).catch((error: unknown) => {
              notify.error('Could not complete', toUserMessage(error));
            });
          }}
          style={styles.complete}
        />
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    header: {
      gap: spacing.xs,
      marginBottom: spacing.lg,
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
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
    },
    crownText: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 12,
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
    finalScore: {
      fontFamily: fonts.body,
      color: c.textMuted,
    },
    complete: {
      marginTop: spacing.lg,
    },
  });
