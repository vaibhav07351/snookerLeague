import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import * as matchService from '@/features/match/services/match.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { HintCard } from '@/shared/ui/HintCard';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import type { MatchFormat, Player } from '@/shared/types/domain';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

export default function NewMatchScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { user, league } = useSession();
  const params = useLocalSearchParams<{ opponentPlayerId?: string; leagueId?: string }>();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [format, setFormat] = useState<MatchFormat>('doubles');
  const [sideA, setSideA] = useState<string[]>([]);
  const [sideB, setSideB] = useState<string[]>([]);
  const [bestOf, setBestOf] = useState(3);
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [midway, setMidway] = useState(false);
  const [busy, setBusy] = useState(false);

  const perSide = format === 'singles' ? 1 : 2;
  const scoringLeagueId =
    typeof params.leagueId === 'string' && params.leagueId ? params.leagueId : (league?.id ?? null);

  // Set up once per league. Depending on the league object would reset the form every
  // time anything in the league is scored (the object changes on each update).
  const leagueId = league?.id ?? null;
  const defaultBestOf = league?.defaultBestOf ?? 3;
  useEffect(() => {
    if (!leagueId || !scoringLeagueId) {
      return;
    }
    setBestOf(defaultBestOf);
    void playersService.listPlayers(scoringLeagueId).then((list) => {
      setPlayers(list);
      setLoaded(true);
      const opponent = typeof params.opponentPlayerId === 'string' ? params.opponentPlayerId : null;
      if (opponent) {
        setFormat('singles');
        const me = list.find((p) => p.authUid === user?.uid);
        setSideA(me ? [me.id] : []);
        setSideB([opponent]);
      }
    });
  }, [leagueId, defaultBestOf, scoringLeagueId, params.opponentPlayerId, user?.uid]);

  const nameOf = useMemo(() => {
    const byId = new Map(players.map((p) => [p.id, p.displayName]));
    return (id: string): string => byId.get(id) ?? 'Player';
  }, [players]);

  function changeFormat(next: MatchFormat): void {
    setFormat(next);
    const cap = next === 'singles' ? 1 : 2;
    setSideA((a) => a.slice(0, cap));
    setSideB((b) => b.slice(0, cap));
  }

  /** Tap a player: fills Side A first, then Side B. Tap again to remove. */
  function toggle(id: string): void {
    if (sideA.includes(id)) {
      setSideA(sideA.filter((x) => x !== id));
      return;
    }
    if (sideB.includes(id)) {
      setSideB(sideB.filter((x) => x !== id));
      return;
    }
    if (sideA.length < perSide) {
      setSideA([...sideA, id]);
    } else if (sideB.length < perSide) {
      setSideB([...sideB, id]);
    }
  }

  const ready = sideA.length === perSide && sideB.length === perSide;

  async function create(): Promise<void> {
    if (!scoringLeagueId || !user || !ready) {
      return;
    }
    setBusy(true);
    try {
      const match = await matchService.createMatch({
        leagueId: scoringLeagueId,
        createdByUid: user.uid,
        format,
        teamA: sideA,
        teamB: sideB,
        bestOf,
        namedLabel: label.trim() || null,
        crownsChampion: crowns,
      });
      router.replace({
        pathname: '/match/[id]',
        params: midway ? { id: match.id, midway: '1' } : { id: match.id },
      });
    } catch (error) {
      notify.error('Could not create the match', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!league) {
    return (
      <Screen>
        <EmptyState
          icon="people-outline"
          title="Join or create a league first"
          message="Matches belong to a league, so friends can follow them live."
          actionLabel="Set up a league"
          onAction={() => router.replace('/onboarding')}
        />
      </Screen>
    );
  }

  const needed = perSide * 2;

  return (
    <Screen>
      <HintCard
        hintKey="match-new"
        title="Setting up a match"
        tips={[
          'Pick singles or doubles, then tap players: the first fill Side A, the rest Side B.',
          'No account needed for opponents: add them as guests on the Players screen.',
          'Already playing? Switch on "We are already mid-match" to enter the score so far.',
        ]}
      />

      <View style={styles.segment}>
        {(['singles', 'doubles'] as const).map((f) => (
          <Pressable
            key={f}
            accessibilityRole="radio"
            accessibilityState={{ selected: format === f }}
            onPress={() => changeFormat(f)}
            style={[styles.segmentItem, format === f && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, format === f && styles.segmentTextOn]}>
              {f === 'singles' ? 'Singles · 1v1' : 'Doubles · 2v2'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sides}>
        <SideSlot side="a" ids={sideA} perSide={perSide} nameOf={nameOf} onRemove={toggle} />
        <Text style={styles.vs}>vs</Text>
        <SideSlot side="b" ids={sideB} perSide={perSide} nameOf={nameOf} onRemove={toggle} />
      </View>

      <SectionTitle title="Players" />
      {loaded && players.length < needed ? (
        <EmptyState
          icon="person-add-outline"
          title="Need more players"
          message={`${format === 'singles' ? 'Singles' : 'Doubles'} needs ${needed} players. Add friends as guests, or invite them to the league.`}
          actionLabel="Add players"
          onAction={() => router.push('/(main)/players')}
        />
      ) : (
        <View style={styles.grid}>
          {players.map((p) => {
            const inA = sideA.includes(p.id);
            const inB = sideB.includes(p.id);
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: inA || inB }}
                onPress={() => toggle(p.id)}
                style={[
                  styles.player,
                  inA && { borderColor: palette.teamA, backgroundColor: palette.teamASoft },
                  inB && { borderColor: palette.teamB, backgroundColor: palette.teamBSoft },
                ]}
              >
                <Text
                  style={[
                    styles.playerText,
                    inA && { color: palette.teamA },
                    inB && { color: palette.teamB },
                  ]}
                  numberOfLines={1}
                >
                  {inA ? 'A · ' : inB ? 'B · ' : ''}
                  {p.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <SectionTitle title="Best of" />
      <View style={styles.grid}>
        {BEST_OF_OPTIONS.map((n) => (
          <Chip
            key={n}
            label={`${n} frame${n === 1 ? '' : 's'}`}
            selected={bestOf === n}
            onPress={() => setBestOf(n)}
          />
        ))}
      </View>
      <Text style={styles.hint}>First to {matchService.framesToWin(bestOf)} wins.</Text>

      <SectionTitle title="Extras" />
      <Card>
        <ToggleRow
          title="Title match"
          hint="The winner becomes the league champion."
          value={crowns}
          onChange={setCrowns}
        />
        <View style={styles.divider} />
        <ToggleRow
          title="We are already mid-match"
          hint="Enter frames won and the current score next."
          value={midway}
          onChange={setMidway}
        />
      </Card>

      <TextField
        label="Match name (optional)"
        value={label}
        onChangeText={setLabel}
        placeholder="e.g. Friday final"
        maxLength={40}
      />

      <Button
        label={ready ? 'Start match' : `Pick ${needed} players`}
        icon="play"
        loading={busy}
        onPress={() => void create()}
        disabled={busy || !ready}
      />
    </Screen>
  );
}

function SideSlot({
  side,
  ids,
  perSide,
  nameOf,
  onRemove,
}: {
  side: 'a' | 'b';
  ids: string[];
  perSide: number;
  nameOf: (id: string) => string;
  onRemove: (id: string) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const tone = sideColor(palette, side);
  return (
    <View style={[styles.slot, { borderColor: tone }]}>
      <Text style={[styles.slotTitle, { color: tone }]}>Side {side.toUpperCase()}</Text>
      {Array.from({ length: perSide }, (_, i) => {
        const id = ids[i];
        return id ? (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${nameOf(id)} from side ${side.toUpperCase()}`}
            onPress={() => onRemove(id)}
            hitSlop={4}
          >
            <Text style={styles.slotName} numberOfLines={1}>
              {nameOf(id)}
            </Text>
          </Pressable>
        ) : (
          <Text key={`empty-${i}`} style={styles.slotEmpty}>
            Tap a player
          </Text>
        );
      })}
    </View>
  );
}

function ToggleRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={title}
        trackColor={{ false: palette.cardRaised, true: palette.primary }}
        thumbColor={palette.text}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    segment: {
      flexDirection: 'row',
      padding: 4,
      gap: 4,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: spacing.sm,
    },
    segmentItem: {
      flex: 1,
      minHeight: 44,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentOn: {
      backgroundColor: c.primary,
    },
    segmentText: {
      fontFamily: fonts.bodyBold,
      fontSize: 14,
      color: c.textMuted,
    },
    segmentTextOn: {
      color: c.onPrimary,
    },
    sides: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    vs: {
      fontFamily: fonts.bodyBold,
      fontSize: 12,
      color: c.textMuted,
    },
    slot: {
      flex: 1,
      minWidth: 0,
      minHeight: 84,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      gap: 4,
    },
    slotTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    slotName: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
      minHeight: 24,
    },
    slotEmpty: {
      fontFamily: fonts.body,
      fontSize: 13,
      color: c.textFaint,
      minHeight: 24,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    player: {
      maxWidth: '100%',
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    playerText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.text,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: 12,
      lineHeight: 17,
      color: c.textMuted,
      marginTop: 4,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    toggleText: {
      flex: 1,
      minWidth: 0,
    },
    toggleTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
    },
  });
