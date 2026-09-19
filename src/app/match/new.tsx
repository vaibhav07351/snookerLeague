import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { MatchFormat, Player } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function NewMatchScreen(): ReactNode {
  const { user, league } = useSession();
  const params = useLocalSearchParams<{ opponentPlayerId?: string; leagueId?: string }>();
  const [players, setPlayers] = useState<Player[]>([]);
  const [format, setFormat] = useState<MatchFormat>('doubles');
  const [selected, setSelected] = useState<string[]>([]);
  const [bestOf, setBestOf] = useState('3');
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [targetLeagueId, setTargetLeagueId] = useState<string | null>(null);

  const needed = format === 'singles' ? 2 : 4;
  const scoringLeagueId = targetLeagueId ?? league?.id ?? null;

  useEffect(() => {
    if (!league) {
      return;
    }
    const lid =
      params.leagueId && typeof params.leagueId === 'string' ? params.leagueId : league.id;
    setTargetLeagueId(lid);
    setBestOf(String(league.defaultBestOf));
    void playersService.listPlayers(lid).then((list) => {
      setPlayers(list);
      const opponent = typeof params.opponentPlayerId === 'string' ? params.opponentPlayerId : null;
      if (opponent) {
        setFormat('singles');
        const me = list.find((p) => p.authUid === user?.uid);
        if (me) {
          setSelected([me.id, opponent]);
        } else {
          setSelected([opponent]);
        }
      }
    });
  }, [league, params.leagueId, params.opponentPlayerId, user?.uid]);

  function setMatchFormat(next: MatchFormat): void {
    setFormat(next);
    setSelected([]);
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= needed) {
        return prev;
      }
      return [...prev, id];
    });
  }

  async function create(): Promise<void> {
    if (!scoringLeagueId || !user) {
      return;
    }
    if (selected.length !== needed) {
      Alert.alert(
        format === 'singles' ? 'Pick two players' : 'Pick four players',
        format === 'singles'
          ? 'Select player A, then player B.'
          : 'Select in order: Team A (2), then Team B (2).',
      );
      return;
    }
    setBusy(true);
    try {
      const teamA = format === 'singles' ? [selected[0]!] : [selected[0]!, selected[1]!];
      const teamB = format === 'singles' ? [selected[1]!] : [selected[2]!, selected[3]!];
      const match = await matchService.createMatch({
        leagueId: scoringLeagueId,
        createdByUid: user.uid,
        format,
        teamA,
        teamB,
        bestOf: Number(bestOf) || league?.defaultBestOf || 3,
        namedLabel: label.trim() || null,
        crownsChampion: crowns,
      });
      router.replace(`/match/${match.id}`);
    } catch (error) {
      Alert.alert('Could not create match', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!league) {
    return null;
  }

  const preview =
    selected.length === needed
      ? format === 'singles'
        ? {
            a: players.find((p) => p.id === selected[0])?.displayName ?? '?',
            b: players.find((p) => p.id === selected[1])?.displayName ?? '?',
          }
        : {
            a: `${players.find((p) => p.id === selected[0])?.displayName ?? '?'} & ${players.find((p) => p.id === selected[1])?.displayName ?? '?'}`,
            b: `${players.find((p) => p.id === selected[2])?.displayName ?? '?'} & ${players.find((p) => p.id === selected[3])?.displayName ?? '?'}`,
          }
      : null;

  return (
    <Screen>
      <View style={styles.formatTabs}>
        <Pressable
          onPress={() => setMatchFormat('doubles')}
          style={[styles.formatTab, format === 'doubles' && styles.formatTabOn]}
        >
          <Text style={[styles.formatText, format === 'doubles' && styles.formatTextOn]}>
            Doubles
          </Text>
          <Text style={styles.formatHint}>2v2</Text>
        </Pressable>
        <Pressable
          onPress={() => setMatchFormat('singles')}
          style={[styles.formatTab, format === 'singles' && styles.formatTabOn]}
        >
          <Text style={[styles.formatText, format === 'singles' && styles.formatTextOn]}>
            Singles
          </Text>
          <Text style={styles.formatHint}>1v1</Text>
        </Pressable>
      </View>

      <Text style={typography.subtitle}>
        {format === 'singles'
          ? 'Tap two players — first is A, second is B.'
          : 'Tap four players in order — first two Team A, next two Team B.'}
      </Text>

      {players.length < needed ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Need more players</Text>
          <Text style={styles.emptyBody}>
            {format === 'singles'
              ? 'Singles needs 2 people. Add a guest from Players.'
              : 'Doubles needs 4 people. Add guests from the Players screen.'}
          </Text>
          <Button label="Go to players" onPress={() => router.push('/(main)/players')} />
        </View>
      ) : (
        <View style={styles.grid}>
          {players.map((p) => {
            const idx = selected.indexOf(p.id);
            const active = idx >= 0;
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p.id)}
                style={[styles.chip, active && styles.chipOn]}
              >
                <Text style={[styles.chipText, active && styles.chipTextOn]}>
                  {active ? `${idx + 1}. ` : ''}
                  {p.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {preview ? (
        <View style={styles.preview}>
          <Text style={typography.label}>{format === 'singles' ? 'Players' : 'Teams'}</Text>
          <Text style={styles.previewLine}>{preview.a}</Text>
          <Text style={styles.vs}>vs</Text>
          <Text style={styles.previewLine}>{preview.b}</Text>
        </View>
      ) : null}

      <TextField
        label="Best of"
        value={bestOf}
        onChangeText={setBestOf}
        keyboardType="number-pad"
        hint="Odd numbers work best (3, 5, 7…)"
      />
      <TextField
        label="Match name (optional)"
        value={label}
        onChangeText={setLabel}
        placeholder="Masters, Final…"
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Crowns reigning champions</Text>
          <Text style={styles.switchHint}>Winner becomes home-screen champ(s)</Text>
        </View>
        <Switch
          value={crowns}
          onValueChange={setCrowns}
          trackColor={{ false: colors.feltLight, true: colors.gold }}
        />
      </View>
      <Button
        label="Start match"
        loading={busy}
        onPress={() => void create()}
        disabled={busy || selected.length !== needed}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formatTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  formatTab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
  },
  formatTabOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  formatText: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  formatTextOn: {
    color: colors.felt,
  },
  formatHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
  },
  chipTextOn: {
    color: colors.felt,
    fontFamily: fonts.bodyBold,
  },
  preview: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  previewLine: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  vs: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
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
    gap: 2,
  },
  switchLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
  },
  switchHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.chalkMuted,
  },
  empty: {
    marginVertical: spacing.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  emptyBody: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
});
