import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as groupService from '@/features/group/services/group.service';
import { GuestForm } from '@/features/match/components/GuestForm';
import { NewMatchOptions } from '@/features/match/components/NewMatchOptions';
import { PlayerPickGrid } from '@/features/match/components/PlayerPickGrid';
import { SideSlot } from '@/features/match/components/SideSlot';
import { useNewMatchForm, type NewMatchKind } from '@/features/match/hooks/use-new-match';
import * as matchService from '@/features/match/services/match.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { freeForAllRules, matchRules } from '@/features/rules/services/rules';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { useAutoTour } from '@/features/tour/hooks/use-tour';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Screen } from '@/shared/ui/Screen';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

const BEST_OF_OPTIONS = [1, 3, 5, 7, 9, 11] as const;

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

interface NewMatchScreenProps {
  /** Seat this player on Side B (a "challenge" or "play again" shortcut). */
  opponentPlayerId?: string;
  leagueId?: string;
}

/** Set up a match: format, sides (or playing order), best of, and rare options. */
export function NewMatchScreen({ opponentPlayerId, leagueId }: NewMatchScreenProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { league } = useSession();
  const f = useNewMatchForm({ opponentPlayerId, leagueId });
  const [moreOpen, setMoreOpen] = useState(false);
  const [addingGuest, setAddingGuest] = useState(false);
  useAutoTour('match-new', f.loaded && league != null);

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

  // Says what is still missing: with you already in Side A, singles needs just one more.
  const picked = f.freeForAll ? f.group.length : f.sideA.length + f.sideB.length;
  const missing = Math.max(1, f.needed - picked);
  const startLabel = f.ready
    ? 'Start match'
    : `Pick ${f.freeForAll ? 'at least ' : ''}${missing} ${picked > 0 ? 'more ' : ''}${missing === 1 ? 'player' : 'players'}`;
  const tooFew = f.loaded && f.players.length < f.needed;

  return (
    // One page, no scroll: only the player list scrolls (inside its own box) when the league is
    // big. Typing (a match name, a guest) lets the page scroll, since the keyboard comes up.
    <Screen
      scroll={moreOpen || addingGuest}
      footer={
        <TourTarget id="match-new.start">
          <Button
            label={startLabel}
            icon="play"
            loading={f.busy}
            onPress={() => void f.create()}
            disabled={f.busy || !f.ready}
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
            accessibilityState={{ selected: f.format === kind }}
            onPress={() => f.changeFormat(kind)}
            style={[styles.segmentItem, f.format === kind && styles.segmentOn]}
          >
            <Text
              style={[styles.segmentText, f.format === kind && styles.segmentTextOn]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Pressable>
        ))}
      </TourTarget>

      {f.freeForAll ? (
        // The numbered player chips below already show the order, so this stays one line.
        <TourTarget id="match-new.sides" style={styles.orderSlot}>
          <Text style={[styles.slotTitle, { color: palette.primary }]}>Playing order</Text>
          <Text style={styles.orderHint} numberOfLines={2}>
            {f.group.length === 0
              ? `Tap ${groupService.MIN_GROUP_PLAYERS} to ${groupService.MAX_GROUP_PLAYERS} players in the order they play. #1 breaks.`
              : `${f.group.length} picked · ${f.nameOf(f.group[0] ?? '')} breaks. Tap again to remove.`}
          </Text>
        </TourTarget>
      ) : (
        <TourTarget id="match-new.sides" style={styles.sides}>
          <SideSlot
            side="a"
            ids={f.sideA}
            perSide={f.sizeA}
            nameOf={f.nameOf}
            onRemove={f.toggle}
          />
          <Text style={styles.vs}>vs</Text>
          <SideSlot
            side="b"
            ids={f.sideB}
            perSide={f.sizeB}
            nameOf={f.nameOf}
            onRemove={f.toggle}
          />
        </TourTarget>
      )}

      <View style={styles.labelGap} />
      {tooFew ? (
        <Text style={styles.needMore}>
          {KIND_NAMES[f.format]} needs {f.freeForAll ? 'at least ' : ''}
          {f.needed} players. Add a guest below, or invite friends from the league screen.
        </Text>
      ) : null}
      {addingGuest ? (
        <GuestForm
          onAdd={async (name) => {
            if (await f.addGuest(name)) {
              setAddingGuest(false);
            }
          }}
          onCancel={() => setAddingGuest(false)}
        />
      ) : null}
      <PlayerPickGrid
        players={f.players}
        sideA={f.sideA}
        sideB={f.sideB}
        group={f.group}
        freeForAll={f.freeForAll}
        onToggle={f.toggle}
        onAddGuest={f.loaded && !addingGuest ? () => setAddingGuest(true) : null}
        boxed={!(moreOpen || addingGuest)}
      />

      <View style={[styles.bestOfHead, styles.labelGap]}>
        <View style={styles.bestOfLabel}>
          <Text style={styles.label}>Best of</Text>
          <Text style={styles.hint}>
            {f.freeForAll
              ? `Plays ${f.bestOf}, most frames wins`
              : `First to ${matchService.framesToWin(f.bestOf)} wins`}
          </Text>
        </View>
        <RulesButton
          rules={
            f.format === 'free_for_all' ? freeForAllRules(f.bestOf) : matchRules(f.bestOf, f.format)
          }
        />
      </View>
      <View style={styles.bestOfRow}>
        {BEST_OF_OPTIONS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityLabel={`Best of ${n}`}
            accessibilityState={{ selected: f.bestOf === n }}
            onPress={() => f.setBestOf(n)}
            style={[styles.bestOf, f.bestOf === n && styles.bestOfOn]}
          >
            <Text style={[styles.bestOfText, f.bestOf === n && styles.bestOfTextOn]}>{n}</Text>
          </Pressable>
        ))}
      </View>

      <TourTarget id="match-new.extras" style={styles.labelGap}>
        <NewMatchOptions
          open={moreOpen}
          onToggleOpen={() => setMoreOpen((v) => !v)}
          freeForAll={f.freeForAll}
          canCrown={f.canCrown}
          crowns={f.crowns}
          setCrowns={f.setCrowns}
          midway={f.midway}
          setMidway={f.setMidway}
          label={f.label}
          setLabel={f.setLabel}
        />
      </TourTarget>
    </Screen>
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
      fontSize: typeScale.small,
      color: c.textMuted,
    },
    segmentTextOn: {
      color: c.onPrimary,
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
    slotTitle: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    orderHint: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      lineHeight: 18,
      color: c.textMuted,
    },
    sides: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    vs: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.caption,
      color: c.textMuted,
    },
    needMore: {
      fontFamily: fonts.body,
      fontSize: typeScale.small,
      lineHeight: 18,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    hint: {
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      lineHeight: 17,
      color: c.textMuted,
      marginTop: 4,
    },
    label: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
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
      fontSize: typeScale.lead,
      color: c.text,
    },
    bestOfTextOn: {
      color: c.onPrimary,
    },
  });
