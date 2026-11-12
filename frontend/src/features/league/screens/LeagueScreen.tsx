import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { AddLeagueSheet } from '@/features/league/components/AddLeagueSheet';
import { InviteCard } from '@/features/league/components/InviteCard';
import { LeagueSettingsSheet } from '@/features/league/components/LeagueSettingsSheet';
import * as leagueService from '@/features/league/services/league.service';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { toUserMessage } from '@/shared/errors/app-error';
import type { League } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HeaderIconButton } from '@/shared/ui/HeaderIconButton';
import { notify } from '@/shared/ui/notify';
import { Screen } from '@/shared/ui/Screen';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

/**
 * My leagues and the selected one's invite. Settings (name, defaults, delete) and adding a
 * league are one tap away in the header, so the screen fits without scrolling.
 */
export function LeagueScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const navigation = useNavigation();
  const { user, league, leagues, refresh, switchLeague } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'settings' | 'add' | null>(null);
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
  const hasSelected = selected != null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          {hasSelected ? (
            <HeaderIconButton
              icon="settings-outline"
              label="League settings"
              onPress={() => setSheet('settings')}
            />
          ) : null}
          <HeaderIconButton icon="add" label="Add a league" onPress={() => setSheet('add')} />
        </View>
      ),
    });
  }, [navigation, hasSelected, styles]);

  useAutoTour('league', user != null && leagues.length > 0);

  if (!user) {
    return null;
  }
  const sessionUser = user;
  const close = (): void => setSheet(null);

  async function makeActive(target: League): Promise<void> {
    try {
      await switchLeague(target.id);
      notify.success(`${target.name} is now your active league`);
    } catch (error) {
      notify.error('Could not switch league', toUserMessage(error));
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
      close();
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
          actionLabel="Add a league"
          onAction={() => setSheet('add')}
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
          <LeagueSettingsSheet
            visible={sheet === 'settings'}
            onClose={close}
            league={selected}
            isOwner={selected.createdByUid === sessionUser.uid}
            busy={busy}
            onSaved={refresh}
            onDelete={onDelete}
          />
        </>
      ) : null}

      <AddLeagueSheet
        visible={sheet === 'add'}
        onClose={close}
        user={sessionUser}
        onCreated={async (id) => {
          await refresh();
          setSelectedId(id);
        }}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
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
      fontSize: typeScale.lead,
      color: c.text,
    },
    rowMeta: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      color: c.textMuted,
    },
    activePill: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
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
  });
