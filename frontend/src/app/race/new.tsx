import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import * as raceService from '@/features/race/services/race.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { Player } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, spacing, type Palette } from '@/theme/tokens';

export default function NewRaceScreen(): ReactNode {
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('50');
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [busy, setBusy] = useState(false);
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();

  useEffect(() => {
    if (!league) {
      return;
    }
    setTarget(String(league.defaultRaceTarget));
    void playersService.listPlayers(league.id).then(setPlayers);
  }, [league]);

  function toggle(id: string): void {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
      notify.error('Could not start race', toUserMessage(error));
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
        Everyone scores alone. First to the target is 1st, then 2nd, 3rd, and so on.
      </Text>

      <SectionTitle title="Players" />
      {players.length < 2 ? (
        <EmptyState
          icon="people-outline"
          title="Add at least two players"
          message="Races need 2+ people on the roster."
          actionLabel="Go to players"
          onAction={() => router.push('/(main)/players')}
        />
      ) : (
        <View style={styles.grid}>
          {players.map((p) => (
            <Chip
              key={p.id}
              label={p.displayName}
              selected={selected.includes(p.id)}
              onPress={() => toggle(p.id)}
            />
          ))}
        </View>
      )}

      <Text style={[styles.selectedCount, selected.length >= 2 && styles.selectedReady]}>
        {selected.length} selected{selected.length < 2 ? ' · pick 2+' : ''}
      </Text>

      <SectionTitle title="Race settings" />

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
      <Card style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Crowns race king</Text>
          <Text style={styles.switchHint}>1st place becomes the race king</Text>
        </View>
        <Switch
          accessibilityLabel="Crowns race king"
          value={crowns}
          onValueChange={setCrowns}
          trackColor={{ false: palette.cardRaised, true: palette.primary }}
        />
      </Card>
      <Button
        label="Start race"
        icon="flag"
        loading={busy}
        onPress={() => void create()}
        disabled={busy || selected.length < 2}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    selectedCount: {
      fontFamily: fonts.body,
      color: c.textMuted,
      marginTop: spacing.sm,
      fontSize: 13,
    },
    selectedReady: {
      color: c.text,
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
      minWidth: 0,
      gap: 2,
    },
    switchLabel: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 15,
    },
    switchHint: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
  });
