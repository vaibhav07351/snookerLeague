import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as groupService from '@/features/group/services/group.service';
import { BestOfPicker } from '@/features/match/components/BestOfPicker';
import { GuestForm } from '@/features/match/components/GuestForm';
import { MatchKindTabs } from '@/features/match/components/MatchKindTabs';
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
      <MatchKindTabs value={f.format} onChange={f.changeFormat} />

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

      <BestOfPicker
        value={f.bestOf}
        onChange={f.setBestOf}
        hint={
          f.freeForAll
            ? `Plays ${f.bestOf}, most frames wins`
            : `First to ${matchService.framesToWin(f.bestOf)} wins`
        }
        accessory={
          <RulesButton
            rules={
              f.format === 'free_for_all'
                ? freeForAllRules(f.bestOf)
                : matchRules(f.bestOf, f.format)
            }
          />
        }
      />

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
    labelGap: {
      marginTop: spacing.md,
    },
  });
