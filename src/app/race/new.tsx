import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { Player } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function NewRaceScreen(): ReactNode {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('50');
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!league) {
      return;
    }
    setTarget(String(league.defaultRaceTarget));
    void playersService.listPlayers(league.id).then(setPlayers);
  }, [league]);

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function create(): Promise<void> {
    if (!league || !user) {
      return;
    }
    setBusy(true);
    try {
      const race = await raceService.createRace({
        leagueId: league.id,
        createdByUid: user.uid,
        playerIds: selected,
        targetScore: Number(target) || league.defaultRaceTarget,
        namedLabel: label.trim() || null,
        crownsRaceChampion: crowns,
      });
      router.replace(`/race/${race.id}`);
    } catch (error) {
      Alert.alert('Could not start race', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!league) {
    return null;
  }

  return (
    <Screen>
      <Text style={typography.subtitle}>
        Everyone scores alone. First to the target is 1st — then 2nd, 3rd, and so on.
      </Text>

      {players.length < 2 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Add at least two players</Text>
          <Text style={styles.emptyBody}>Races need 2+ people on the roster.</Text>
          <Button label="Go to players" onPress={() => router.push('/(main)/players')} />
        </View>
      ) : (
        <View style={styles.grid}>
          {players.map((p) => {
            const on = selected.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.displayName}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.selectedCount}>
        {selected.length} selected{selected.length < 2 ? ' · pick 2+' : ''}
      </Text>

      <TextField
        label="Target score"
        value={target}
        onChangeText={setTarget}
        keyboardType="number-pad"
        hint="Common targets: 50, 75, 100"
      />
      <TextField
        label="Race name (optional)"
        value={label}
        onChangeText={setLabel}
        placeholder="Friday race…"
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Crowns race king</Text>
          <Text style={styles.switchHint}>1st place becomes the race king</Text>
        </View>
        <Switch
          value={crowns}
          onValueChange={setCrowns}
          trackColor={{ false: colors.feltLight, true: colors.gold }}
        />
      </View>
      <Button
        label="Start race"
        loading={busy}
        onPress={() => void create()}
        disabled={busy || selected.length < 2}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
  },
  chipTextOn: {
    color: colors.felt,
    fontFamily: fonts.bodyBold,
  },
  selectedCount: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.md,
    fontSize: 13,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: 2,
  },
  switchLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
  },
  switchHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  empty: {
    marginVertical: spacing.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  emptyBody: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
});
