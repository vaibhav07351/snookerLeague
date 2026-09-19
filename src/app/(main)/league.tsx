import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import * as leagueService from '@/features/league/services/league.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import type { League } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

type AddMode = 'hidden' | 'create' | 'join';
type DeleteStep = 'idle' | 'typeName';

export default function LeagueScreen(): ReactNode {
  const { user, league, leagues, refresh, switchLeague } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [raceTarget, setRaceTarget] = useState('50');
  const [bestOf, setBestOf] = useState('3');
  const [addMode, setAddMode] = useState<AddMode>('hidden');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newRaceTarget, setNewRaceTarget] = useState('50');
  const [newBestOf, setNewBestOf] = useState('3');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [deleteTypedName, setDeleteTypedName] = useState('');

  useEffect(() => {
    if (leagues.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && leagues.some((l) => l.id === prev)) {
        return prev;
      }
      return league?.id ?? leagues[0]?.id ?? null;
    });
  }, [leagues, league?.id]);

  const selected: League | null = leagues.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      return;
    }
    setName(selected.name);
    setRaceTarget(String(selected.defaultRaceTarget));
    setBestOf(String(selected.defaultBestOf));
    setDeleteStep('idle');
    setDeleteTypedName('');
  }, [selected?.id, selected?.name, selected?.defaultRaceTarget, selected?.defaultBestOf]);

  if (!user) {
    return null;
  }

  const sessionUser = user;
  const isCreator = selected != null && selected.createdByUid === sessionUser.uid;
  const nameMatches = selected != null && deleteTypedName.trim() === selected.name;

  async function save(): Promise<void> {
    if (!selected) {
      return;
    }
    try {
      await leagueService.updateLeagueDefaults(selected.id, {
        name,
        defaultRaceTarget: Number(raceTarget) || 50,
        defaultBestOf: Number(bestOf) || 3,
      });
      await refresh();
      Alert.alert('Saved', 'League settings updated');
    } catch (error) {
      Alert.alert('Could not save', toUserMessage(error));
    }
  }

  async function onCreateAnother(): Promise<void> {
    setBusy(true);
    try {
      const created = await leagueService.createLeague({
        name: newLeagueName.trim() || `${sessionUser.displayName}'s League`,
        uid: sessionUser.uid,
        displayName: sessionUser.displayName,
        photoUrl: sessionUser.photoUrl,
        defaultRaceTarget: Number(newRaceTarget) || 50,
        defaultBestOf: Number(newBestOf) || 3,
      });
      await refresh();
      setAddMode('hidden');
      setNewLeagueName('');
      setNewRaceTarget('50');
      setNewBestOf('3');
      setSelectedId(created.id);
      await switchLeague(created.id);
      router.replace('/(main)');
    } catch (error) {
      Alert.alert('Could not create league', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onJoinAnother(): Promise<void> {
    if (joinCode.trim().length < 4) {
      Alert.alert('Invite code', 'Enter the invite code from a friend');
      return;
    }
    setBusy(true);
    try {
      const joined = await leagueService.joinLeague({
        code: joinCode,
        uid: sessionUser.uid,
        displayName: sessionUser.displayName,
        photoUrl: sessionUser.photoUrl,
      });
      await refresh();
      setAddMode('hidden');
      setJoinCode('');
      setSelectedId(joined.id);
      await switchLeague(joined.id);
      router.replace('/(main)');
    } catch (error) {
      Alert.alert('Could not join league', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function startDeleteFlow(): Promise<void> {
    if (!selected || !isCreator) {
      return;
    }
    const step1 = await confirmAction(
      'Delete this league?',
      `"${selected.name}" and all of its matches, races, players, and stats will be permanently removed. This cannot be undone.`,
      'I understand — continue',
    );
    if (!step1) {
      return;
    }
    const step2 = await confirmAction(
      'Are you absolutely sure?',
      'There is no recovery. Everyone in this league will lose this table’s history on this device.',
      'Yes, go to final step',
    );
    if (!step2) {
      return;
    }
    setDeleteTypedName('');
    setDeleteStep('typeName');
  }

  async function confirmDeleteTyped(): Promise<void> {
    if (!selected || !nameMatches) {
      return;
    }
    const ok = await confirmAction(
      'Final confirmation',
      `Type-check passed. Delete "${selected.name}" forever now?`,
      'Delete forever',
    );
    if (!ok) {
      setDeleteStep('idle');
      setDeleteTypedName('');
      return;
    }
    setBusy(true);
    try {
      const result = await leagueService.deleteLeague({
        leagueId: selected.id,
        uid: sessionUser.uid,
        typedName: deleteTypedName,
      });
      await refresh();
      setDeleteStep('idle');
      setDeleteTypedName('');
      if (result.nextActiveLeagueId) {
        setSelectedId(result.nextActiveLeagueId);
        Alert.alert('League deleted', 'Switched to another league you belong to.');
        router.replace('/(main)');
      } else {
        setSelectedId(null);
        Alert.alert('League deleted', 'Create or join a league to continue.');
        router.replace('/onboarding');
      }
    } catch (error) {
      Alert.alert('Could not delete', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut(): Promise<void> {
    const ok = await confirmAction('Log out?', 'You can sign back in anytime.', 'Log out');
    if (!ok) {
      return;
    }
    try {
      await authService.signOut();
      await refresh();
      router.replace('/login');
    } catch (error) {
      Alert.alert('Could not log out', toUserMessage(error));
    }
  }

  return (
    <Screen>
      <Text style={typography.subtitle}>
        All leagues you’re in. Open one for invite code, settings, or delete. Switch active league
        from Profile.
      </Text>

      <Text style={[typography.label, styles.section]}>Your leagues</Text>
      {leagues.length === 0 ? (
        <Text style={styles.empty}>No leagues yet — create or join one below.</Text>
      ) : (
        leagues.map((l) => {
          const open = l.id === selected?.id;
          const active = l.id === league?.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => setSelectedId(l.id)}
              style={[styles.leagueRow, open && styles.leagueRowOn]}
            >
              <View style={styles.leagueCopy}>
                <Text style={[styles.leagueName, open && styles.leagueNameOn]}>{l.name}</Text>
                <Text style={styles.leagueMeta}>
                  {active ? 'Active · ' : ''}
                  {l.createdByUid === sessionUser.uid ? 'You created · ' : ''}
                  code {l.inviteCode}
                </Text>
              </View>
              <Text style={styles.chevron}>{open ? '▾' : '›'}</Text>
            </Pressable>
          );
        })
      )}

      {selected ? (
        <View style={styles.detail}>
          <Text style={[typography.label, styles.section]}>Details · {selected.name}</Text>

          <View style={styles.codePanel}>
            <Text style={typography.label}>Invite code</Text>
            <Text style={styles.code}>{selected.inviteCode}</Text>
            <Text style={styles.hint}>Share this so friends can join this league.</Text>
          </View>

          <TextField label="League name" value={name} onChangeText={setName} />
          <TextField
            label="Default race target"
            value={raceTarget}
            onChangeText={setRaceTarget}
            keyboardType="number-pad"
          />
          <TextField
            label="Default best-of"
            value={bestOf}
            onChangeText={setBestOf}
            keyboardType="number-pad"
          />
          <Button label="Save settings" onPress={() => void save()} />

          {isCreator ? (
            <View style={styles.dangerZone}>
              <Text style={typography.label}>Danger zone</Text>
              <Text style={styles.dangerHint}>
                Deleting removes every match, race, player, and stat in this league on this device.
                Only you (the creator) can do this.
              </Text>
              {deleteStep === 'idle' ? (
                <Button
                  label="Delete this league…"
                  variant="danger"
                  onPress={() => void startDeleteFlow()}
                  disabled={busy}
                />
              ) : (
                <View style={styles.deletePanel}>
                  <Text style={styles.deleteTitle}>Type the league name to confirm</Text>
                  <Text style={styles.deleteHint}>
                    Enter exactly: <Text style={styles.deleteExact}>{selected.name}</Text>
                  </Text>
                  <TextField
                    label="League name"
                    value={deleteTypedName}
                    onChangeText={setDeleteTypedName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={selected.name}
                  />
                  <View style={styles.addRow}>
                    <Button
                      label="Cancel"
                      variant="ghost"
                      style={styles.addBtn}
                      disabled={busy}
                      onPress={() => {
                        setDeleteStep('idle');
                        setDeleteTypedName('');
                      }}
                    />
                    <Button
                      label="Delete forever"
                      variant="danger"
                      style={styles.addBtn}
                      loading={busy}
                      disabled={busy || !nameMatches}
                      onPress={() => void confirmDeleteTyped()}
                    />
                  </View>
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.dangerHint}>
              Only the creator can delete this league. You can leave switching from Profile.
            </Text>
          )}
        </View>
      ) : null}

      <Text style={[typography.label, styles.section]}>Add another league</Text>
      {addMode === 'hidden' ? (
        <View style={styles.addRow}>
          <Button
            label="Create another"
            variant="secondary"
            onPress={() => setAddMode('create')}
            style={styles.addBtn}
          />
          <Button
            label="Join another"
            variant="secondary"
            onPress={() => setAddMode('join')}
            style={styles.addBtn}
          />
        </View>
      ) : (
        <View style={styles.addPanel}>
          <View style={styles.addTabs}>
            <Pressable
              onPress={() => setAddMode('create')}
              style={[styles.addTab, addMode === 'create' && styles.addTabOn]}
            >
              <Text style={[styles.addTabText, addMode === 'create' && styles.addTabTextOn]}>
                Create
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAddMode('join')}
              style={[styles.addTab, addMode === 'join' && styles.addTabOn]}
            >
              <Text style={[styles.addTabText, addMode === 'join' && styles.addTabTextOn]}>
                Join
              </Text>
            </Pressable>
          </View>
          {addMode === 'create' ? (
            <>
              <TextField
                label="New league name"
                value={newLeagueName}
                onChangeText={setNewLeagueName}
                placeholder={`${sessionUser.displayName}'s League`}
              />
              <TextField
                label="Default race target"
                value={newRaceTarget}
                onChangeText={setNewRaceTarget}
                keyboardType="number-pad"
                hint="Points to win a race"
              />
              <TextField
                label="Default best-of"
                value={newBestOf}
                onChangeText={setNewBestOf}
                keyboardType="number-pad"
                hint="Odd numbers work best (3, 5, 7…)"
              />
            </>
          ) : (
            <TextField
              label="Invite code"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              autoCapitalize="characters"
              placeholder="AB12CD"
              maxLength={8}
            />
          )}
          <View style={styles.addRow}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setAddMode('hidden');
                setNewLeagueName('');
                setNewRaceTarget('50');
                setNewBestOf('3');
                setJoinCode('');
              }}
              style={styles.addBtn}
              disabled={busy}
            />
            <Button
              label={addMode === 'create' ? 'Create & open' : 'Join & open'}
              loading={busy}
              onPress={() => void (addMode === 'create' ? onCreateAnother() : onJoinAnother())}
              style={styles.addBtn}
              disabled={busy}
            />
          </View>
        </View>
      )}

      <View style={styles.spacer} />
      <Button label="Sign out" variant="ghost" onPress={() => void onSignOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.md,
  },
  leagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  leagueRowOn: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBright,
  },
  leagueCopy: {
    flex: 1,
    gap: 2,
  },
  leagueName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.chalk,
  },
  leagueNameOn: {
    color: colors.goldSoft,
  },
  leagueMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  chevron: {
    fontFamily: fonts.bodyBold,
    color: colors.chalkMuted,
    fontSize: 18,
  },
  detail: {
    marginTop: spacing.sm,
  },
  codePanel: {
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.xs,
  },
  code: {
    fontFamily: fonts.display,
    fontSize: 36,
    letterSpacing: 6,
    color: colors.goldSoft,
    marginVertical: spacing.xs,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    lineHeight: 20,
    fontSize: 14,
  },
  dangerZone: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: 'rgba(255, 107, 92, 0.08)',
    gap: spacing.sm,
  },
  dangerHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.chalkMuted,
    marginBottom: spacing.xs,
  },
  deletePanel: {
    gap: spacing.sm,
  },
  deleteTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.coral,
    fontSize: 15,
  },
  deleteHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.chalkMuted,
    lineHeight: 18,
  },
  deleteExact: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  addBtn: {
    flex: 1,
  },
  addPanel: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: spacing.sm,
  },
  addTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  addTabOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  addTabText: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
  },
  addTabTextOn: {
    color: colors.felt,
  },
  spacer: {
    height: spacing.xl,
  },
});
