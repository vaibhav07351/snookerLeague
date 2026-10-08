import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { Screen } from '@/features/home/components/Screen';
import {
  COMPARE_TABS,
  compareRows,
  type CompareTab,
} from '@/features/stats/components/compare-rows';
import { CompareSide } from '@/features/stats/components/CompareSide';
import { HeadToHeadCard } from '@/features/stats/components/HeadToHeadCard';
import { PlayerPickerSheet } from '@/features/stats/components/PlayerPickerSheet';
import { SplitBar } from '@/features/stats/components/SplitBar';
import { useCompare } from '@/features/stats/hooks/use-compare';
import { useLeagueStats, type LeagueStats } from '@/features/stats/hooks/use-league-stats';
import { useLayout } from '@/shared/hooks/use-layout';
import { EmptyState } from '@/shared/ui/EmptyState';
import { FitContent } from '@/shared/ui/FitContent';
import { LoadingState } from '@/shared/ui/LoadingState';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

/** Picks the strongest other player as the default opponent. */
function defaultOpponent(stats: LeagueStats, aId: string | null): string | null {
  const others = stats.players.filter((p) => p.id !== aId);
  const ranked = [...others].sort(
    (x, y) => (stats.ranks.get(x.id) ?? 999) - (stats.ranks.get(y.id) ?? 999),
  );
  return ranked[0]?.id ?? null;
}

function valid(stats: LeagueStats, id: string | undefined | null): string | null {
  return id && stats.playerById.has(id) ? id : null;
}

export function CompareScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { short } = useLayout();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const { league, user } = useSession();
  const stats = useLeagueStats(league?.id, user?.uid);
  const [tab, setTab] = useState<CompareTab>('overall');
  const [picking, setPicking] = useState<'a' | 'b' | null>(null);
  // Choices made on this screen, tied to the link that opened it so a new link starts fresh.
  const paramsKey = `${params.a ?? ''}|${params.b ?? ''}`;
  const [chosen, setChosen] = useState<{ key: string; a: string | null; b: string | null }>({
    key: paramsKey,
    a: null,
    b: null,
  });
  const own = chosen.key === paramsKey ? chosen : { key: paramsKey, a: null, b: null };

  const aId =
    valid(stats, own.a) ?? valid(stats, params.a) ?? stats.meId ?? stats.players[0]?.id ?? null;
  const bCandidate = valid(stats, own.b) ?? valid(stats, params.b);
  const bId = bCandidate && bCandidate !== aId ? bCandidate : defaultOpponent(stats, aId);
  const comparison = useCompare(stats, aId, bId);

  if (!league || !stats.ready) {
    return (
      <Screen scroll={false}>
        <LoadingState label="Loading comparison" />
      </Screen>
    );
  }

  if (!comparison) {
    return (
      <Screen>
        <EmptyState
          icon="git-compare-outline"
          title="Need two players"
          message="Add another player to this league to compare."
          actionLabel="Add players"
          onAction={() => router.push('/(main)/players')}
        />
      </Screen>
    );
  }

  const { a, b, h2h } = comparison;
  const rows = compareRows(tab, a, b);

  return (
    <Screen scroll={false}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <CompareSide
            card={a}
            color={palette.teamA}
            align="left"
            onPress={() => setPicking('a')}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap players"
            onPress={() => setChosen({ key: paramsKey, a: bId, b: aId })}
            style={({ pressed }) => [styles.swap, pressed && styles.pressed]}
          >
            <Ionicons name="swap-horizontal" size={20} color={palette.text} />
          </Pressable>
          <CompareSide
            card={b}
            color={palette.teamB}
            align="right"
            onPress={() => setPicking('b')}
          />
        </View>

        <HeadToHeadCard h2h={h2h} dense={short} />

        <SegmentedTabs size="sm" items={COMPARE_TABS} value={tab} onChange={setTab} />

        <FitContent contentStyle={styles.rows}>
          {rows.map((row) => (
            <SplitBar key={row.key} row={row} />
          ))}
        </FitContent>
      </View>

      <PlayerPickerSheet
        visible={picking != null}
        title={picking === 'a' ? 'Left player' : 'Right player'}
        players={stats.players}
        ratings={stats.ratings}
        selectedId={picking === 'a' ? aId : bId}
        disabledId={picking === 'a' ? bId : aId}
        meId={stats.meId}
        onSelect={(id) =>
          setChosen({
            key: paramsKey,
            a: picking === 'a' ? id : aId,
            b: picking === 'b' ? id : bId,
          })
        }
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minHeight: 0,
      gap: spacing.sm + 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    swap: {
      width: TOUCH_TARGET,
      height: TOUCH_TARGET,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    pressed: {
      opacity: 0.75,
    },
    rows: {
      justifyContent: 'space-around',
      gap: spacing.xs,
    },
  });
