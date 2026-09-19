import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player, Race, RacePlace } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { colors, fonts, spacing, typography } from '@/theme/tokens';

function formatRacePlace(place: RacePlace | null): string {
  if (place === null) {
    return '—';
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
        <Text style={typography.subtitle}>Loading race…</Text>
      </Screen>
    );
  }

  const nameOf = (pid: string): string =>
    players.find((p) => p.id === pid)?.displayName ?? 'Player';

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
    Alert.alert('Could not record', toUserMessage(error));
  }

  async function saveScore(playerId: string): Promise<void> {
    try {
      const raw = draftScores[playerId] ?? '';
      const score = raw.trim() === '' ? 0 : Number(raw) || 0;
      await raceService.setEntrantScore(race!.id, playerId, score);
    } catch (error) {
      Alert.alert('Could not update score', toUserMessage(error));
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
      Alert.alert("Could not mark didn't finish", toUserMessage(error));
    } finally {
      setBusyPlayerId(null);
    }
  }

  async function undoDidntFinish(playerId: string): Promise<void> {
    setBusyPlayerId(playerId);
    try {
      await raceService.undoDnf(race!.id, playerId);
    } catch (error) {
      Alert.alert('Could not undo', toUserMessage(error));
    } finally {
      setBusyPlayerId(null);
    }
  }

  return (
    <Screen>
      {race.namedLabel ? <Text style={typography.label}>{race.namedLabel}</Text> : null}
      <Text style={styles.target}>Race to {race.targetScore}</Text>
      <Text style={styles.meta}>
        {race.status === 'completed' ? 'Finished' : 'In progress'}
        {race.crownsRaceChampion ? ' · Crowns race king' : ''}
      </Text>

      <RaceLiveBoard
        race={race}
        nameOf={nameOf}
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
          playerName={scoringId ? nameOf(scoringId) : null}
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

      {race.status === 'in_progress' ? (
        <Text style={styles.finalHeading}>Or set final score</Text>
      ) : null}

      {sorted.map((e) => {
        const playerName = nameOf(e.playerId);
        const busy = busyPlayerId === e.playerId;
        return (
          <View key={e.playerId} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.name}>{playerName}</Text>
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
                  onPress={() => void saveScore(e.playerId)}
                  style={styles.save}
                />
                <Pressable
                  accessibilityRole="button"
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

      {race.status === 'in_progress' ? (
        <Button
          label="Complete race"
          onPress={() => {
            void raceService.completeRace(race.id).catch((error: unknown) => {
              Alert.alert('Could not complete', toUserMessage(error));
            });
          }}
          style={styles.complete}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  target: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.goldSoft,
    marginVertical: spacing.sm,
  },
  meta: {
    color: colors.chalkMuted,
    marginBottom: spacing.lg,
  },
  finalHeading: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    color: colors.chalk,
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
  },
  place: {
    color: colors.gold,
    fontWeight: '800',
  },
  placeOut: {
    color: colors.danger,
  },
  scoreEdit: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  scoreField: {
    flex: 1,
  },
  save: {
    marginBottom: spacing.md,
  },
  outLink: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  outLinkText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  outRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  undoLinkText: {
    color: colors.mint,
    fontWeight: '700',
    fontSize: 14,
  },
  finalScore: {
    color: colors.chalkMuted,
  },
  complete: {
    marginTop: spacing.lg,
  },
});
