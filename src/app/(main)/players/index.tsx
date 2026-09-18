import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { subscribeStore } from '@/shared/storage/local-store';
import type { Player } from '@/shared/types/domain';
import { colors, spacing, typography } from '@/theme/tokens';

export default function PlayersScreen(): ReactNode {
  const { league } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [guestName, setGuestName] = useState('');
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!league) {
      return;
    }
    setPlayers(await playersService.listPlayers(league.id));
  }, [league]);

  useEffect(() => {
    void reload();
    return subscribeStore(() => setTick((t) => t + 1));
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [tick, reload]);

  async function addGuest(): Promise<void> {
    if (!league) {
      return;
    }
    try {
      await playersService.addGuestPlayer({ leagueId: league.id, displayName: guestName });
      setGuestName('');
    } catch (error) {
      Alert.alert('Could not add guest', toUserMessage(error));
    }
  }

  if (!league) {
    return null;
  }

  return (
    <Screen scroll={false}>
      <Text style={typography.subtitle}>
        Add everyone at the table. Guests don’t need the app.
      </Text>
      <View style={styles.addRow}>
        <View style={styles.fieldGrow}>
          <TextField
            label="Add a guest"
            value={guestName}
            onChangeText={setGuestName}
            placeholder="Friend’s name"
            returnKeyType="done"
            onSubmitEditing={() => void addGuest()}
            hint="Use this for people who aren’t signed in"
          />
        </View>
        <Button label="Add" onPress={() => void addGuest()} style={styles.addBtn} />
      </View>
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={typography.subtitle}>No players yet — add your friends above.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/(main)/players/${item.id}`)}
          >
            <View>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.meta}>
                {item.kind === 'guest' ? 'Guest' : 'Member'} · W {item.stats.standard.winPct}% · 1st{' '}
                {item.stats.race.firstPct}%
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fieldGrow: {
    flex: 1,
  },
  addBtn: {
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: {
    color: colors.chalk,
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    color: colors.chalkMuted,
    marginTop: 2,
    fontSize: 13,
  },
  chev: {
    color: colors.goldSoft,
    fontSize: 22,
  },
});
