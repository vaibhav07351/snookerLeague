import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
import { TextField } from '@/shared/ui/TextField';
import * as groupService from '@/features/group/services/group.service';
import * as matchService from '@/features/match/services/match.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { freeForAllRules, matchRules } from '@/features/rules/services/rules';
import * as playersService from '@/features/players/services/players.service';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { toUserMessage } from '@/shared/errors/app-error';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import type { MatchFormat, Player } from '@/shared/types/domain';
import { sideColor } from '@/theme/palettes';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

/** What the scorer picks: a two-sided format, or free-for-all (each player for themselves). */
type NewMatchKind = MatchFormat | 'free_for_all';

const KIND_OPTIONS: { kind: NewMatchKind; title: string; sub: string }[] = [
  { kind: 'singles', title: 'Singles', sub: '1 v 1' },
  { kind: 'doubles', title: 'Doubles', sub: '2 v 2' },
  { kind: 'one_vs_two', title: '1 vs 2', sub: 'Solo v pair' },
  { kind: 'free_for_all', title: 'Free-for-all', sub: '3 to 8' },
];

const KIND_NAMES: Record<NewMatchKind, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  one_vs_two: '1 vs 2',
  free_for_all: 'Free-for-all',
};

export default function NewMatchScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { user, league } = useSession();
  const params = useLocalSearchParams<{ opponentPlayerId?: string; leagueId?: string }>();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [format, setFormat] = useState<NewMatchKind>('doubles');
  const [sideA, setSideA] = useState<string[]>([]);
  const [sideB, setSideB] = useState<string[]>([]);
  /** Free-for-all players, in playing order (the first one breaks). */
  const [group, setGroup] = useState<string[]>([]);
  const [bestOf, setBestOf] = useState(3);
  const [label, setLabel] = useState('');
  const [crowns, setCrowns] = useState(false);
  const [midway, setMidway] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const freeForAll = format === 'free_for_all';
  const [sizeA, sizeB] = freeForAll ? [0, 0] : matchService.sideSizesOf(format);
  const canCrown = !freeForAll && matchService.formatCanCrown(format);
  const scoringLeagueId =
    typeof params.leagueId === 'string' && params.leagueId ? params.leagueId : (league?.id ?? null);

  // Set up once per league. Depending on the league object would reset the form every
  // time anything in the league is scored (the object changes on each update).
  const leagueId = league?.id ?? null;
  const defaultBestOf = matchService.oddBestOf(league?.defaultBestOf ?? 3);
  useEffect(() => {
    if (!leagueId || !scoringLeagueId) {
      return;
    }
    setBestOf(defaultBestOf);
    void playersService.listPlayers(scoringLeagueId).then((list) => {
      setPlayers(list);
      setLoaded(true);
      // Doubles needs 4; a small roster would open on a "need more players" message.
      if (list.length < 4) {
        setFormat('singles');
      }
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

  function changeFormat(next: NewMatchKind): void {
    setFormat(next);
    if (next === 'free_for_all') {
      // Carry the players already picked over, in the order they were picked.
      setGroup((g) => (g.length > 0 ? g : [...sideA, ...sideB]));
      setCrowns(false);
      setMidway(false);
      return;
    }
    const [capA, capB] = matchService.sideSizesOf(next);
    setSideA((a) => a.slice(0, capA));
    setSideB((b) => b.slice(0, capB));
    if (!matchService.formatCanCrown(next)) {
      setCrowns(false);
    }
  }

  /** Free-for-all: tap adds a player to the end of the playing order; tap again removes. */
  function toggleGroup(id: string): void {
    if (group.includes(id)) {
      setGroup(group.filter((x) => x !== id));
    } else if (group.length < groupService.MAX_GROUP_PLAYERS) {
      setGroup([...group, id]);
    }
  }

  /** Tap a player: fills Side A first, then Side B. Tap again to remove. */
  function toggle(id: string): void {
    if (freeForAll) {
      toggleGroup(id);
      return;
    }
    if (sideA.includes(id)) {
      setSideA(sideA.filter((x) => x !== id));
      return;
    }
    if (sideB.includes(id)) {
      setSideB(sideB.filter((x) => x !== id));
      return;
    }
    if (sideA.length < sizeA) {
      setSideA([...sideA, id]);
    } else if (sideB.length < sizeB) {
      setSideB([...sideB, id]);
    }
  }

  const ready = freeForAll
    ? group.length >= groupService.MIN_GROUP_PLAYERS
    : sideA.length === sizeA && sideB.length === sizeB;
  useAutoTour('match-new', loaded && league != null);

  async function create(): Promise<void> {
    if (!scoringLeagueId || !user || !ready) {
      return;
    }
    setBusy(true);
    try {
      if (format === 'free_for_all') {
        const created = await groupService.createGroupMatch({
          leagueId: scoringLeagueId,
          createdByUid: user.uid,
          playerIds: group,
          bestOf,
          namedLabel: label.trim() || null,
        });
        router.replace({ pathname: '/group/[id]', params: { id: created.id } });
        return;
      }
      const match = await matchService.createMatch({
        leagueId: scoringLeagueId,
        createdByUid: user.uid,
        format,
        teamA: sideA,
        teamB: sideB,
        bestOf,
        namedLabel: label.trim() || null,
        crownsChampion: crowns && canCrown,
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

  const needed = freeForAll ? groupService.MIN_GROUP_PLAYERS : sizeA + sizeB;
  const startLabel = ready
    ? 'Start match'
    : freeForAll
      ? `Pick at least ${needed} players`
      : `Pick ${needed} players`;
  const extrasSummary = [
    crowns ? 'Title match' : null,
    midway ? 'Mid-match' : null,
    label.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    // One page, no scroll: only the player list scrolls (inside its own box) when the league is
    // big. Opening "More options" lets the page scroll, since typing a name brings the keyboard.
    <Screen
      scroll={moreOpen}
      footer={
        <TourTarget id="match-new.start">
          <Button
            label={startLabel}
            icon="play"
            loading={busy}
            onPress={() => void create()}
            disabled={busy || !ready}
          />
        </TourTarget>
      }
    >
      <TourTarget id="match-new.format" style={styles.segment}>
        {KIND_OPTIONS.map(({ kind, title, sub }) => (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            accessibilityLabel={`${title}, ${sub}`}
            accessibilityState={{ selected: format === kind }}
            onPress={() => changeFormat(kind)}
            style={[styles.segmentItem, format === kind && styles.segmentOn]}
          >
            <Text
              style={[styles.segmentText, format === kind && styles.segmentTextOn]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </TourTarget>

      {freeForAll ? (
        // The numbered player chips below already show the order, so this stays one line.
        <TourTarget id="match-new.sides" style={styles.orderSlot}>
          <Text style={[styles.slotTitle, { color: palette.primary }]}>Playing order</Text>
          <Text style={styles.orderHint} numberOfLines={2}>
            {group.length === 0
              ? `Tap ${groupService.MIN_GROUP_PLAYERS} to ${groupService.MAX_GROUP_PLAYERS} players in the order they play. #1 breaks.`
              : `${group.length} picked · ${nameOf(group[0] ?? '')} breaks. Tap again to remove.`}
          </Text>
        </TourTarget>
      ) : (
        <TourTarget id="match-new.sides" style={styles.sides}>
          <SideSlot side="a" ids={sideA} perSide={sizeA} nameOf={nameOf} onRemove={toggle} />
          <Text style={styles.vs}>vs</Text>
          <SideSlot side="b" ids={sideB} perSide={sizeB} nameOf={nameOf} onRemove={toggle} />
        </TourTarget>
      )}

      <View style={styles.labelGap} />
      {loaded && players.length < needed ? (
        <EmptyState
          icon="person-add-outline"
          title="Need more players"
          message={`${KIND_NAMES[format]} needs ${freeForAll ? 'at least ' : ''}${needed} players. Add friends as guests, or invite them to the league.`}
          actionLabel="Add players"
          onAction={() => router.push('/(main)/players')}
        />
      ) : (
        <ScrollView
          style={moreOpen ? undefined : styles.playersBox}
          contentContainerStyle={styles.grid}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={!moreOpen}
        >
          {players.map((p) => {
            const seat = freeForAll ? group.indexOf(p.id) : -1;
            const inGroup = seat >= 0;
            const inA = !freeForAll && sideA.includes(p.id);
            const inB = !freeForAll && sideB.includes(p.id);
            const tag = inGroup ? `${seat + 1} · ` : inA ? 'A · ' : inB ? 'B · ' : '';
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityState={{ selected: inA || inB || inGroup }}
                onPress={() => toggle(p.id)}
                style={[
                  styles.player,
                  inA && { borderColor: palette.teamA, backgroundColor: palette.teamASoft },
                  inB && { borderColor: palette.teamB, backgroundColor: palette.teamBSoft },
                  inGroup && {
                    borderColor: palette.primary,
                    backgroundColor: palette.cardHighlight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.playerText,
                    inA && { color: palette.teamA },
                    inB && { color: palette.teamB },
                    inGroup && { color: palette.primary },
                  ]}
                  numberOfLines={1}
                >
                  {tag}
                  {p.displayName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.bestOfHead, styles.labelGap]}>
        <View style={styles.bestOfLabel}>
          <Text style={styles.label}>Best of</Text>
          <Text style={styles.hint}>
            {freeForAll
              ? `Plays ${bestOf}, most frames wins`
              : `First to ${matchService.framesToWin(bestOf)} wins`}
          </Text>
        </View>
        <RulesButton rules={freeForAll ? freeForAllRules(bestOf) : matchRules(bestOf, format)} />
      </View>
      <View style={styles.bestOfRow}>
        {BEST_OF_OPTIONS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`Best of ${n}`}
            accessibilityState={{ selected: bestOf === n }}
            onPress={() => setBestOf(n)}
            style={[styles.bestOf, bestOf === n && styles.bestOfOn]}
          >
            <Text style={[styles.bestOfText, bestOf === n && styles.bestOfTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <TourTarget id="match-new.extras" style={styles.labelGap}>
        <Card style={styles.moreCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: moreOpen }}
            onPress={() => setMoreOpen((v) => !v)}
            style={styles.moreHead}
          >
            <Ionicons name="options-outline" size={18} color={palette.textMuted} />
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>More options</Text>
              <Text style={styles.moreSummary} numberOfLines={1}>
                {extrasSummary ||
                  (freeForAll
                    ? 'Match name'
                    : canCrown
                      ? 'Title match, mid-match, name'
                      : 'Mid-match, name')}
              </Text>
            </View>
            <Ionicons
              name={moreOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={palette.textMuted}
            />
          </Pressable>
          {moreOpen ? (
            <View style={styles.moreBody}>
              {canCrown ? (
                <>
                  <ToggleRow
                    title="Title match"
                    hint="The winner becomes the league champion."
                    value={crowns}
                    onChange={setCrowns}
                  />
                  <View style={styles.divider} />
                </>
              ) : null}
              {freeForAll ? null : (
                <ToggleRow
                  title="We are already mid-match"
                  hint="Enter frames won and the current score next."
                  value={midway}
                  onChange={setMidway}
                />
              )}
              <TextField
                label="Match name (optional)"
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Friday final"
                maxLength={40}
              />
            </View>
          ) : null}
        </Card>
      </TourTarget>
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
    // Sized to the label, spare width shared: "Free-for-all" is far longer than "1 vs 2", and
    // equal quarters cut it off on 320-wide phones. Titles only, so all four fit one row.
    segmentItem: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      minHeight: 44,
      paddingHorizontal: 6,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentOn: {
      backgroundColor: c.primary,
    },
    segmentText: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      color: c.textMuted,
    },
    // Takes the height left over, so the page itself never scrolls.
    playersBox: {
      flex: 1,
      minHeight: 0,
    },
    orderSlot: {
      marginTop: spacing.md,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.primary,
      gap: 2,
    },
    orderHint: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
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
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    labelGap: {
      marginTop: spacing.md,
    },
    bestOfHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    bestOfLabel: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexShrink: 1,
      gap: spacing.sm,
    },
    bestOfRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    bestOf: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    bestOfOn: {
      borderColor: c.primary,
      backgroundColor: c.primary,
    },
    bestOfText: {
      fontFamily: fonts.bodyBold,
      fontSize: 16,
      color: c.text,
    },
    bestOfTextOn: {
      color: c.onPrimary,
    },
    moreCard: {
      paddingVertical: 0,
    },
    moreHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
    },
    moreSummary: {
      fontFamily: fonts.body,
      fontSize: 12,
      color: c.textMuted,
    },
    moreBody: {
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
  });
