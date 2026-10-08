import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Player } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

export default function PlayersScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
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
      notify.error(editingId ? 'Could not save name' : 'Could not add guest', toUserMessage(error));
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
        ? "They'll be removed from this club. Past matches keep their score but the name may show as missing."
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
      notify.error('Could not delete', toUserMessage(error));
    }
  }

  if (!league) {
    return null;
  }

  const editing = editingId != null;

  return (
    <Screen scroll={false}>
      <Text style={typography.subtitle}>Add everyone at the table. Guests don't need the app.</Text>
      <View style={styles.addRow}>
        <View style={styles.fieldGrow}>
          <TextField
            label={editing ? 'Edit player' : 'Add a guest'}
            value={guestName}
            onChangeText={setGuestName}
            placeholder="Friend's name"
            returnKeyType="done"
            onSubmitEditing={() => void savePlayer()}
            hint={
              editing
                ? 'Change the name, then tap Save'
                : "Use this for people who aren't signed in"
            }
          />
        </View>
        <Button
          label={editing ? 'Save' : 'Add'}
          icon={editing ? 'checkmark' : 'add'}
          onPress={() => void savePlayer()}
          style={styles.addBtn}
        />
      </View>
      {editing ? (
        <Button
          label="Cancel edit"
          variant="ghost"
          size="sm"
          onPress={() => {
            setEditingId(null);
            setGuestName('');
          }}
          style={styles.cancel}
        />
      ) : null}
      <FlatList
        data={players}
        keyExtractor={(item) => item.id}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No players yet"
            message="Add your friends above. Guests don't need the app."
          />
        }
        renderItem={({ item }) => {
          const mine = Boolean(user?.uid && item.authUid === user.uid);
          const canDelete = Boolean(user?.uid && user.uid === league.createdByUid && !mine);
          const isEditing = editingId === item.id;
          return (
            <Card tone={isEditing ? 'highlight' : 'default'} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.displayName}`}
                style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                onPress={() => router.push(`/(main)/players/${item.id}`)}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {item.kind === 'guest' ? 'Guest' : 'Member'} · W {item.stats.standard.winPct}% ·
                  1st {item.stats.race.firstPct}% · HB {item.stats.standard.highestBreak || '-'}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.displayName}`}
                  onPress={() => startEdit(item)}
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="create-outline" size={20} color={palette.textMuted} />
                </Pressable>
                {canDelete ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${item.displayName}`}
                    onPress={() => void removePlayer(item)}
                    style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                  >
                    <Ionicons name="trash-outline" size={20} color={palette.danger} />
                  </Pressable>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    addRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    fieldGrow: {
      flex: 1,
      minWidth: 0,
    },
    addBtn: {
      marginBottom: spacing.md,
      paddingHorizontal: spacing.md,
    },
    cancel: {
      alignSelf: 'flex-start',
      marginBottom: spacing.sm,
    },
    listFlex: {
      flex: 1,
    },
    list: {
      gap: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
      paddingRight: spacing.xs,
    },
    rowMain: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET,
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    pressed: {
      opacity: 0.7,
    },
    name: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 17,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      marginTop: 2,
      fontSize: 13,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBtn: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
