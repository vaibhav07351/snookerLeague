import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import * as tournamentService from '@/features/tournament/services/tournament.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player, TournamentFormat } from '@/shared/types/domain';
import { Chip } from '@/shared/ui/Chip';
import { notify } from '@/shared/ui/notify';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { Stepper } from '@/shared/ui/Stepper';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

const FORMATS = [
  { key: 'knockout', label: 'Knockout' },
  { key: 'round_robin', label: 'Round robin' },
] as const;

/** Set up a tournament: name, format, frames per match, and players in seed order. */
export default function NewTournamentScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const { user, league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('knockout');
  const [bestOf, setBestOf] = useState(3);
  const [entrants, setEntrants] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setPlayers(league ? await playersService.listPlayers(league.id) : []);
  }, [league]);
  useStoreReload(reload, league?.id ?? null);

  function toggle(id: string): void {
    setEntrants((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function create(): Promise<void> {
    if (!user || !league) {
      return;
    }
    setBusy(true);
    try {
      const t = await tournamentService.createTournament({
        leagueId: league.id,
        uid: user.uid,
        name,
        format,
        entrants,
        bestOf,
      });
      router.replace(`/tournament/${t.id}`);
    } catch (error) {
      notify.error('Could not create the tournament', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <TextField
        label="Tournament name"
        value={name}
        onChangeText={setName}
        placeholder="Club Cup"
        maxLength={40}
      />
      <SegmentedTabs items={FORMATS} value={format} onChange={setFormat} style={styles.block} />
      <Stepper
        label="Best of (frames)"
        value={bestOf}
        min={1}
        max={35}
        step={2}
        onChange={setBestOf}
      />
      <Text style={styles.heading}>Players, in seed order</Text>
      <Text style={styles.hint}>
        Tap players in order of strength: the first tap is the top seed. In a knockout, top seeds
        get any byes and meet as late as possible.
      </Text>
      <View style={styles.chips}>
        {players.map((p) => {
          const seed = entrants.indexOf(p.id);
          return (
            <Chip
              key={p.id}
              label={seed >= 0 ? `${seed + 1}. ${p.displayName}` : p.displayName}
              selected={seed >= 0}
              onPress={() => toggle(p.id)}
            />
          );
        })}
      </View>
      <Button
        label={`Create (${entrants.length} players)`}
        icon="trophy-outline"
        onPress={() => void create()}
        loading={busy}
        disabled={busy || entrants.length < 2}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: {
      marginVertical: spacing.md,
    },
    heading: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
      marginTop: spacing.lg,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
      marginVertical: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
  });
