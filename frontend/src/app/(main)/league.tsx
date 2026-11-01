import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import { DeleteLeaguePanel } from '@/features/league/components/DeleteLeaguePanel';
import { InviteCard } from '@/features/league/components/InviteCard';
import * as leagueService from '@/features/league/services/league.service';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
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
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  useAutoTour('league', user != null && leagues.length > 0);

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

  return (
    <Screen>
      {leagues.length === 0 ? (
        <EmptyState
          icon="trophy-outline"
          title="No leagues yet"
          message="Create one for your group, or join a friend's with their invite."
        />
      ) : (
        <TourTarget id="league.list" style={styles.list}>
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
        </TourTarget>
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

          <TourTarget id="league.invite" style={styles.section}>
            <InviteCard league={selected} uid={sessionUser.uid} />
          </TourTarget>

          <Expander
            icon="settings-outline"
            title="League settings"
            summary={`Race to ${selected.defaultRaceTarget} · best of ${selected.defaultBestOf}`}
            open={settingsOpen}
            onToggle={() => setSettingsOpen((v) => !v)}
          >
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
            {isCreator ? (
              <DeleteLeaguePanel league={selected} busy={busy} onDelete={onDelete} />
            ) : (
              <Text style={styles.note}>Only the league owner can delete this league.</Text>
            )}
          </Expander>
        </>
      ) : null}

      <Expander
        icon="add-circle-outline"
        title="Add another league"
        summary="Create one, or join with a code"
        open={addMode !== 'hidden'}
        onToggle={() => setAddMode(addMode === 'hidden' ? 'create' : 'hidden')}
      >
        <View style={styles.chips}>
          <Chip
            label="Create a league"
            selected={addMode === 'create'}
            onPress={() => setAddMode('create')}
          />
          <Chip
            label="Join with a code"
            selected={addMode === 'join'}
            onPress={() => setAddMode('join')}
          />
        </View>
        {addMode === 'create' ? (
          <>
            <TextField
              label="New league name"
              value={newLeagueName}
              onChangeText={setNewLeagueName}
              placeholder={`${sessionUser.displayName}'s League`}
              maxLength={40}
            />
            <Button label="Create league" loading={busy} onPress={() => void onCreateAnother()} />
          </>
        ) : null}
        {addMode === 'join' ? (
          <>
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
          </>
        ) : null}
      </Expander>
    </Screen>
  );
}

interface ExpanderProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** A one-line row that unfolds a rarely used form in place (keeps keyboard handling simple). */
function Expander({ icon, title, summary, open, onToggle, children }: ExpanderProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Card style={styles.expander}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.expanderHead}
      >
        <Ionicons name={icon} size={18} color={palette.textMuted} />
        <View style={styles.rowText}>
          <Text style={styles.expanderTitle}>{title}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textMuted} />
      </Pressable>
      {open ? <View style={styles.expanderBody}>{children}</View> : null}
    </Card>
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
    section: {
      marginTop: spacing.lg,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    note: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
    },
    expander: {
      marginTop: spacing.md,
      paddingVertical: 0,
    },
    expanderHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 56,
    },
    expanderTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    expanderBody: {
      gap: spacing.sm,
      paddingBottom: spacing.md,
    },
  });
