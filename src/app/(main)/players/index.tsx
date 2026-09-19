import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { colors, spacing, typography } from '@/theme/tokens';

export default function PlayersScreen(): ReactNode {
  const { league, user } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [guestName, setGuestName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const leagueId = league?.id;

  const reload = useCallback(async () => {
    if (!leagueId) {
      return;
    }
    setPlayers(await playersService.listPlayers(leagueId));
  }, [leagueId]);

  useStoreReload(reload, leagueId ?? null);

  async function savePlayer(): Promise<void> {
    if (!league) {
      return;
    }
    try {
      if (editingId) {
        await playersService.renamePlayer(editingId, guestName);
        setEditingId(null);
      } else {
        await playersService.addGuestPlayer({ leagueId: league.id, displayName: guestName });
      }
      setGuestName('');
    } catch (error) {
      Alert.alert(editingId ? 'Could not save name' : 'Could not add guest', toUserMessage(error));
    }
  }

  function startEdit(player: Player): void {
    setEditingId(player.id);
    setGuestName(player.displayName);
  }

  async function removePlayer(player: Player): Promise<void> {
    if (!user) {
      return;
    }
    const ok = await confirmAction(
      `Delete ${player.displayName}?`,
      player.kind === 'guest'
        ? 'They’ll be removed from this club. Past matches keep their score but the name may show as missing.'
        : 'This removes them from the club roster. Past matches keep their score but the name may show as missing.',
      'Delete',
    );
    if (!ok) {
      return;
    }
    try {
      await playersService.deletePlayer(player.id, user.uid);
      if (editingId === player.id) {
        setEditingId(null);
        setGuestName('');
      }
    } catch (error) {
      Alert.alert('Could not delete', toUserMessage(error));
    }
  }

  if (!league) {
    return null;
  }

  const editing = editingId != null;

  return (
    <Screen scroll={false}>
      <Text style={typography.subtitle}>Add everyone at the table. Guests don’t need the app.</Text>
      <View style={styles.addRow}>
        <View style={styles.fieldGrow}>
          <TextField
            label={editing ? 'Edit player' : 'Add a guest'}
            value={guestName}
            onChangeText={setGuestName}
            placeholder="Friend’s name"
            returnKeyType="done"
            onSubmitEditing={() => void savePlayer()}
            hint={
              editing
                ? 'Change the name, then tap Save'
                : 'Use this for people who aren’t signed in'
            }
          />
        </View>
        <Button
          label={editing ? 'Save' : 'Add'}
          onPress={() => void savePlayer()}
          style={styles.addBtn}
        />
      </View>
      {editing ? (
        <Button
          label="Cancel edit"
          variant="ghost"
          onPress={() => {
            setEditingId(null);
            setGuestName('');
          }}
        />
      ) : null}
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={typography.subtitle}>No players yet — add your friends above.</Text>
        }
        renderItem={({ item }) => {
          const mine = Boolean(user?.uid && item.authUid === user.uid);
          const canDelete = Boolean(user?.uid && user.uid === league.createdByUid && !mine);
          return (
            <View style={styles.row}>
              <Pressable
                style={styles.rowMain}
                onPress={() => router.push(`/(main)/players/${item.id}`)}
              >
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.meta}>
                  {item.kind === 'guest' ? 'Guest' : 'Member'} · W {item.stats.standard.winPct}% ·
                  1st {item.stats.race.firstPct}%
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => startEdit(item)} hitSlop={8}>
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
                {canDelete ? (
                  <Pressable onPress={() => void removePlayer(item)} hitSlop={8}>
                    <Text style={styles.delete}>Delete</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        }}
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
  listFlex: {
    flex: 1,
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
    gap: spacing.sm,
  },
  rowMain: {
    flex: 1,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  edit: {
    color: colors.goldSoft,
    fontWeight: '700',
    fontSize: 14,
  },
  delete: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 14,
  },
});
