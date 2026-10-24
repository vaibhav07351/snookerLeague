import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BarChart } from '@/features/home/components/charts/BarChart';
import { DonutChart } from '@/features/home/components/charts/DonutChart';
import { paint } from '@/features/stats/components/chart-paint';
import { duration, type DetailKey } from '@/features/stats/components/dashboard-tiles';
import { RatingSpark } from '@/features/stats/components/RatingSpark';
import type { PlayerCard } from '@/features/stats/hooks/use-player-card';
import { PROVISIONAL_GAMES } from '@/features/stats/services/rating.service';
import { useLayout } from '@/shared/hooks/use-layout';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { KeyValueRow } from '@/shared/ui/KeyValueRow';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, type Palette } from '@/theme/tokens';

const TITLES: Record<DetailKey, string> = {
  rating: 'Rating',
  results: 'Match results',
  races: 'Races',
  pace: 'Frame pace',
  scoring: 'Scoring',
};

interface StatDetailSheetProps {
  detail: DetailKey | null;
  card: PlayerCard;
  onClose: () => void;
}

/** The chart and full numbers behind a tile, opened on tap. */
export function StatDetailSheet({ detail, card, onClose }: StatDetailSheetProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { width } = useLayout();
  const i = card.insights;
  const r = card.rating;

  let body: ReactNode = null;
  if (detail === 'rating') {
    body = (
      <>
        <RatingSpark history={r.history} width={Math.max(width - spacing.md * 2 - 2, 200)} />
        <KeyValueRow label="Rating" value={String(r.rating)} />
        <KeyValueRow label="Peak" value={String(r.peak)} />
        <KeyValueRow
          label="League rank"
          value={card.rank != null ? `#${card.rank} of ${card.rankedCount}` : 'Not ranked yet'}
        />
        <KeyValueRow label="Rated results" value={String(r.games)} />
        <Text style={styles.note}>
          Everyone starts at 1000. Beating a higher-rated player earns more than beating a
          lower-rated one, and losing to a lower-rated player costs more. Doubles partners share the
          change, a race counts as a result against every other entrant, and a walkover win earns
          half. You are ranked after {PROVISIONAL_GAMES} results.
        </Text>
      </>
    );
  } else if (detail === 'results') {
    body = (
      <>
        <DonutChart
          slices={paint(i.resultDonut, palette)}
          centerValue={`${i.matchWinPct}%`}
          centerLabel="win rate"
        />
        <KeyValueRow label="Wins" value={String(i.matchWins)} />
        <KeyValueRow label="Losses" value={String(i.cleanLosses)} />
        <KeyValueRow label="Forfeits given" value={String(i.forfeits)} />
        <KeyValueRow label="Wins by forfeit" value={String(i.winsByForfeit)} />
        <KeyValueRow label="Current win streak" value={String(r.currentStreak)} />
        <KeyValueRow label="Best win streak" value={String(r.bestStreak)} />
      </>
    );
  } else if (detail === 'races') {
    body = (
      <>
        <BarChart data={paint(i.placeBars, palette)} height={130} />
        <KeyValueRow label="Races" value={String(i.racesPlayed)} />
        <KeyValueRow label="Wins" value={String(i.raceFirsts)} />
        <KeyValueRow label="Podiums" value={String(i.racePodiums)} />
        <KeyValueRow
          label="Average finish"
          value={i.avgRacePlace != null ? `#${i.avgRacePlace}` : '-'}
        />
        <KeyValueRow label="Current win streak" value={String(i.currentRaceFirstStreak)} />
        <KeyValueRow label="Race titles" value={String(i.raceTitles)} />
      </>
    );
  } else if (detail === 'pace') {
    body = (
      <>
        <BarChart
          data={paint(i.paceBars, palette)}
          height={120}
          emptyLabel="Turn on auto-time in a match to see pace."
        />
        <KeyValueRow label="Average frame" value={duration(i.avgFrameSeconds)} />
        <KeyValueRow label="Frames won" value={duration(i.avgWinFrameSeconds)} />
        <KeyValueRow label="Frames lost" value={duration(i.avgLossFrameSeconds)} />
        <KeyValueRow label="Fastest" value={duration(i.fastestFrameSeconds)} />
        <KeyValueRow label="Slowest" value={duration(i.slowestFrameSeconds)} />
        <KeyValueRow label="Timed frames" value={String(i.timedFrames)} />
      </>
    );
  } else if (detail === 'scoring') {
    body = (
      <>
        <KeyValueRow label="Points scored" value={String(i.pointsScored)} />
        <KeyValueRow label="Frames played" value={String(i.framesPlayed)} />
        <KeyValueRow label="Points per frame" value={String(i.pointsPerFrame ?? '-')} />
        <KeyValueRow label="Fouls" value={String(i.fouls)} />
        <KeyValueRow label="Points given away" value={String(i.foulPoints)} />
        <KeyValueRow label="Net points" value={String(i.netPoints)} />
        <Text style={styles.note}>
          Per-frame numbers compare players fairly, however much they play. Points come from the
          live shot log.
        </Text>
      </>
    );
  }

  return (
    <BottomSheet visible={detail != null} title={detail ? TITLES[detail] : ''} onClose={onClose}>
      {body}
    </BottomSheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    note: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: c.textMuted,
      marginTop: spacing.xs,
    },
  });
