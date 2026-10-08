import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as authService from '@/features/auth/services/auth.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { DeleteLeaguePanel } from '@/features/league/components/DeleteLeaguePanel';
import { InviteCard } from '@/features/league/components/InviteCard';
import * as leagueService from '@/features/league/services/league.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HintCard } from '@/shared/ui/HintCard';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import type { League } from '@/shared/types/domain';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

type AddMode = 'hidden' | 'create' | 'join';

export default function LeagueScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { user, league, leagues, refresh, switchLeague } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [raceTarget, setRaceTarget] = useState('50');
  const [bestOf, setBestOf] = useState('3');
  const [addMode, setAddMode] = useState<AddMode>('hidden');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && leagues.some((l) => l.id === prev)) {
        return prev;
      }
      return league?.id ?? leagues[0]?.id ?? null;
    });
  }, [leagues, league?.id]);

  const selected: League | null = leagues.find((l) => l.id === selectedId) ?? null;

  // Reset the settings form when another league is opened or its saved values change.
  const selectedName = selected?.name;
  const selectedRaceTarget = selected?.defaultRaceTarget;
  const selectedBestOf = selected?.defaultBestOf;
  useEffect(() => {
    if (selectedName === undefined) {
      return;
    }
    setName(selectedName);
    setRaceTarget(String(selectedRaceTarget ?? 50));
    setBestOf(String(selectedBestOf ?? 3));
  }, [selectedId, selectedName, selectedRaceTarget, selectedBestOf]);

  if (!user) {
    return null;
  }
  const sessionUser = user;
  const isCreator = selected != null && selected.createdByUid === sessionUser.uid;

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
      notify.success('League settings saved');
    } catch (error) {
      notify.error('Could not save', toUserMessage(error));
    }
  }

  async function makeActive(target: League): Promise<void> {
    try {
      await switchLeague(target.id);
      notify.success(`${target.name} is now your active league`);
    } catch (error) {
      notify.error('Could not switch league', toUserMessage(error));
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
      });
      await refresh();
      setAddMode('hidden');
      setNewLeagueName('');
      setSelectedId(created.id);
      notify.success('League created', 'Share the invite below so friends can join.');
    } catch (error) {
      notify.error('Could not create league', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function onJoinAnother(): void {
    try {
      const code = leagueService.normalizeInviteCode(joinCode);
      setJoinError(undefined);
      setJoinCode('');
      setAddMode('hidden');
      router.push({ pathname: '/join/[code]', params: { code } });
    } catch (error) {
      setJoinError(toUserMessage(error));
    }
  }

  async function onDelete(typedName: string): Promise<void> {
    if (!selected) {
      return;
    }
    const ok = await confirmAction(
      'Final confirmation',
      `Delete "${selected.name}" forever now?`,
      'Delete forever',
    );
    if (!ok) {
      return;
    }
    setBusy(true);
    try {
      const result = await leagueService.deleteLeague({
        leagueId: selected.id,
        uid: sessionUser.uid,
        typedName,
      });
      await refresh();
      notify.success('League deleted');
      if (result.nextActiveLeagueId) {
        setSelectedId(result.nextActiveLeagueId);
        router.replace('/(main)');
      } else {
        setSelectedId(null);
        router.replace('/onboarding');
      }
    } catch (error) {
      notify.error('Could not delete', toUserMessage(error));
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
      notify.error('Could not log out', toUserMessage(error));
    }
  }

  return (
    <Screen>
      <HintCard
        hintKey="league-invite"
        title="Bring your friends in"
        tips={[
          'Share the invite link: friends tap it, sign in with Google and pick their player.',
          'Already added someone as a guest? They can claim that card and keep its history.',
          'Each league has its own players, matches and champions.',
        ]}
      />

      <SectionTitle title="Your leagues" />
      {leagues.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No leagues yet"
          message="Create one for your group, or join a friend's with their invite."
        />
      ) : (
        <View style={styles.list}>
          {leagues.map((l) => {
            const open = l.id === selected?.id;
            const active = l.id === league?.id;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                accessibilityState={{ selected: open }}
                onPress={() => setSelectedId(l.id)}
                style={[styles.row, open && styles.rowOn]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowName, open && { color: palette.primary }]}
                    numberOfLines={1}
                  >
                    {l.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {l.memberUids.length} member{l.memberUids.length === 1 ? '' : 's'}
                    {l.createdByUid === sessionUser.uid ? ' · you own it' : ''}
                  </Text>
                </View>
                {active ? (
                  <Text style={styles.activePill}>Active</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {selected ? (
        <>
          {selected.id !== league?.id ? (
            <Button
              label={`Make ${selected.name} active`}
              variant="secondary"
              icon="swap-horizontal"
              onPress={() => void makeActive(selected)}
              style={styles.gapTop}
            />
          ) : null}

          <SectionTitle title="Invite" />
          <InviteCard league={selected} uid={sessionUser.uid} />

          <SectionTitle title="Settings" />
          <Card>
            <TextField label="League name" value={name} onChangeText={setName} maxLength={40} />
            <TextField
              label="Default race target"
              value={raceTarget}
              onChangeText={setRaceTarget}
              keyboardType="number-pad"
              hint="Points needed to win a race"
            />
            <TextField
              label="Default best of"
              value={bestOf}
              onChangeText={setBestOf}
              keyboardType="number-pad"
              hint="Frames in a match. Odd numbers work best (3, 5, 7)."
            />
            <Button label="Save settings" onPress={() => void save()} />
          </Card>

          {isCreator ? (
            <DeleteLeaguePanel league={selected} busy={busy} onDelete={onDelete} />
          ) : (
            <Text style={styles.note}>Only the league owner can delete this league.</Text>
          )}
        </>
      ) : null}

      <SectionTitle title="Add another league" />
      <View style={styles.chips}>
        <Chip
          label="Create a league"
          selected={addMode === 'create'}
          onPress={() => setAddMode(addMode === 'create' ? 'hidden' : 'create')}
        />
        <Chip
          label="Join with a code"
          selected={addMode === 'join'}
          onPress={() => setAddMode(addMode === 'join' ? 'hidden' : 'join')}
        />
      </View>
      {addMode === 'create' ? (
        <Card style={styles.gapTop}>
          <TextField
            label="New league name"
            value={newLeagueName}
            onChangeText={setNewLeagueName}
            placeholder={`${sessionUser.displayName}'s League`}
            maxLength={40}
          />
          <Button label="Create league" loading={busy} onPress={() => void onCreateAnother()} />
        </Card>
      ) : null}
      {addMode === 'join' ? (
        <Card style={styles.gapTop}>
          <TextField
            label="Invite code"
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. K7Q2MX"
            maxLength={8}
            error={joinError}
            onSubmitEditing={onJoinAnother}
          />
          <Button label="Continue" icon="arrow-forward" onPress={onJoinAnother} />
        </Card>
      ) : null}

      <Button
        label="Log out"
        variant="ghost"
        icon="log-out-outline"
        onPress={() => void onSignOut()}
        style={styles.logout}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    list: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 60,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    rowOn: {
      borderColor: c.primary,
      backgroundColor: c.cardHighlight,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowName: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    rowMeta: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    activePill: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: c.onPrimary,
      backgroundColor: c.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    gapTop: {
      marginTop: spacing.sm,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    note: {
      marginTop: spacing.lg,
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    logout: {
      marginTop: spacing.xl,
    },
  });
