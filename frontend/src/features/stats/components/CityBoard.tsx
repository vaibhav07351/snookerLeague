import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { divisionLabel, SNOOKER_DIVISIONS } from '@/features/auth/services/division.service';
import { MIN_GAMES_FOR_RANK } from '@/features/community/services/profile.service';
import { RulesButton } from '@/features/rules/components/RulesButton';
import { cityRules } from '@/features/rules/services/rules';
import { LeaderboardRow } from '@/features/stats/components/LeaderboardRow';
import { useCityBoard } from '@/features/stats/hooks/use-city-board';
import { useLayout } from '@/shared/hooks/use-layout';
import type { PlayerProfile, SessionUser, SnookerDivision } from '@/shared/types/domain';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { PagedList } from '@/shared/ui/PagedList';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

type DivisionFilter = 'all' | SnookerDivision;

interface CityBoardProps {
  user: SessionUser | null;
  rowHeight: number;
}

/** City ranking across clubs, filterable by age division. */
export function CityBoard({ user, rowHeight }: CityBoardProps): ReactNode {
  const { compact } = useLayout();
  const styles = useStyles(makeStyles);
  const profiles = useCityBoard(user);
  const [division, setDivision] = useState<DivisionFilter>('all');
  const rows = division === 'all' ? profiles : profiles.filter((p) => p.division === division);
  const ranked = rows.map((profile, i) => ({ profile, rank: i + 1 }));

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        <Chip label="All" selected={division === 'all'} onPress={() => setDivision('all')} />
        {SNOOKER_DIVISIONS.map((d) => (
          <Chip
            key={d}
            label={divisionLabel(d)}
            selected={division === d}
            onPress={() => setDivision(d)}
          />
        ))}
      </ScrollView>
      <View style={styles.hintRow}>
        <Text style={styles.hint} numberOfLines={2}>
          Win % and games played together · {MIN_GAMES_FOR_RANK} games to be ranked
        </Text>
        <RulesButton rules={cityRules(MIN_GAMES_FOR_RANK)} />
      </View>
      <PagedList
        items={ranked}
        rowHeight={rowHeight}
        resetKey={division}
        pinnedKey={user?.uid ?? null}
        keyExtractor={(row) => row.profile.uid}
        empty={
          <EmptyState
            icon="business-outline"
            title="No city results yet"
            message="Play in your city hub to get on the board."
          />
        }
        renderItem={({ profile, rank }: { profile: PlayerProfile; rank: number }) => (
          <LeaderboardRow
            rank={rank}
            name={profile.displayName}
            sub={`${divisionLabel(profile.division)} · ${profile.played} games · HB ${profile.highestBreak || '-'}`}
            value={`${profile.winPct}%`}
            isMe={profile.uid === user?.uid}
            compact={compact}
            onPress={() => router.push(`/(main)/city-player?uid=${profile.uid}`)}
          />
        )}
      />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      minHeight: 0,
      gap: spacing.sm,
    },
    chipsScroll: {
      flexGrow: 0,
    },
    chips: {
      gap: spacing.xs,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    hint: {
      flex: 1,
      fontFamily: fonts.body,
      fontSize: typeScale.caption,
      color: c.textMuted,
    },
  });
