import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as tournamentService from '@/features/tournament/services/tournament.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Tournament } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

/** The active league's tournaments, newest first. */
export default function TournamentsScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const { league } = useSession();
  const [items, setItems] = useState<Tournament[]>([]);

  const reload = useCallback(async () => {
    setItems(league ? await tournamentService.listTournaments(league.id) : []);
  }, [league]);
  useStoreReload(reload, league?.id ?? null);

  return (
    <Screen>
      <Button
        label="New tournament"
        icon="trophy-outline"
        onPress={() => router.push('/tournament/new')}
        style={styles.create}
      />
      {items.length === 0 ? (
        <EmptyState
          icon="git-network-outline"
          title="No tournaments yet"
          message="Run a knockout or a round robin with your league. Winners move on by themselves."
        />
      ) : (
        <View style={styles.list}>
          {items.map((t) => {
            const { state } = tournamentService.stateOf(t);
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push(`/tournament/${t.id}`)}
              >
                <Card>
                  <Text style={styles.name}>{t.name}</Text>
                  <Text style={styles.meta}>
                    {t.format === 'knockout' ? 'Knockout' : 'Round robin'} - {t.entrants.length}{' '}
                    players - {state.completed ? 'Finished' : 'In progress'}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    create: {
      marginBottom: spacing.lg,
    },
    list: {
      gap: spacing.sm,
    },
    name: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    meta: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
  });
