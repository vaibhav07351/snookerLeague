import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Player, Race } from '@/shared/types/domain';
import { colors, spacing, typography } from '@/theme/tokens';

export default function RaceDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [race, setRace] = useState<Race | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!id) {
      return;
    }
    const r = await raceService.getRace(id);
    setRace(r);
    if (r) {
      setPlayers(await playersService.listPlayers(r.leagueId));
      const drafts: Record<string, string> = {};
      r.entrants.forEach((e) => {
        drafts[e.playerId] = e.score > 0 ? String(e.score) : '';
      });
      setDraftScores(drafts);
    }
  }, [id]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  if (!race) {
    return (
      <Screen>
        <Text style={typography.subtitle}>Loading race…</Text>
      </Screen>
    );
  }

  const nameOf = (pid: string): string =>
    players.find((p) => p.id === pid)?.displayName ?? 'Player';

  const sorted = [...race.entrants].sort((a, b) => {
    const placeA = a.place === null ? 999 : a.place === 'dnf' ? 998 : a.place;
    const placeB = b.place === null ? 999 : b.place === 'dnf' ? 998 : b.place;
    if (placeA !== placeB) {
      return placeA - placeB;
    }
    return b.score - a.score;
  });

  async function saveScore(playerId: string): Promise<void> {
    try {
      const raw = draftScores[playerId] ?? '';
      const score = raw.trim() === '' ? 0 : Number(raw) || 0;
      await raceService.setEntrantScore(race!.id, playerId, score);
    } catch (error) {
      Alert.alert('Could not update score', toUserMessage(error));
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

      {sorted.map((e) => (
        <View key={e.playerId} style={styles.row}>
          <View style={styles.rowHead}>
            <Text style={styles.name}>{nameOf(e.playerId)}</Text>
            <Text style={styles.place}>
              {e.place === null ? '—' : e.place === 'dnf' ? 'DNF' : `#${e.place}`}
            </Text>
          </View>
          {race.status === 'in_progress' && e.place === null ? (
            <View style={styles.scoreEdit}>
              <View style={styles.scoreField}>
                <TextField
                  label="Score"
                  value={draftScores[e.playerId] ?? ''}
                  onChangeText={(t) =>
                    setDraftScores((prev) => ({ ...prev, [e.playerId]: t }))
                  }
                  keyboardType="number-pad"
                  placeholder={e.score > 0 ? String(e.score) : 'Enter score'}
                />
              </View>
              <Button label="Save" onPress={() => void saveScore(e.playerId)} style={styles.save} />
              <Button
                label="DNF"
                variant="danger"
                onPress={() => void raceService.markDnf(race.id, e.playerId)}
                style={styles.dnf}
              />
            </View>
          ) : (
            <Text style={styles.finalScore}>Score {e.score}</Text>
          )}
        </View>
      ))}

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
  row: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.chalk,
    fontWeight: '700',
    fontSize: 16,
  },
  place: {
    color: colors.gold,
    fontWeight: '800',
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
  dnf: {
    marginBottom: spacing.md,
  },
  finalScore: {
    color: colors.chalkMuted,
  },
  complete: {
    marginTop: spacing.lg,
  },
});
