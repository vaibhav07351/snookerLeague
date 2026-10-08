import { duration } from '@/features/stats/components/dashboard-tiles';
import type { Better, SplitBarData } from '@/features/stats/components/SplitBar';
import type { PlayerCard } from '@/features/stats/hooks/use-player-card';

export type CompareTab = 'overall' | 'breaks' | 'pace' | 'races';

export const COMPARE_TABS: Array<{ key: CompareTab; label: string }> = [
  { key: 'overall', label: 'Overall' },
  { key: 'breaks', label: 'Breaks' },
  { key: 'pace', label: 'Pace' },
  { key: 'races', label: 'Races' },
];

type Pick = (card: PlayerCard) => number | null;

function row(
  key: string,
  label: string,
  a: PlayerCard,
  b: PlayerCard,
  pick: Pick,
  better: Better,
  format: (n: number) => string = String,
): SplitBarData {
  const av = pick(a);
  const bv = pick(b);
  return {
    key,
    label,
    a: av,
    b: bv,
    aText: av == null ? '-' : format(av),
    bText: bv == null ? '-' : format(bv),
    better,
  };
}

const pct = (n: number): string => `${n}%`;
const time = (n: number): string => duration(n);
/** Durations of zero mean "nothing timed yet", so they are left out of the comparison. */
const timed =
  (pick: (card: PlayerCard) => number | null): Pick =>
  (card) => {
    const v = pick(card);
    return v != null && v > 0 ? v : null;
  };

/** The stat rows for one compare tab, A on the left and B on the right. */
export function compareRows(tab: CompareTab, a: PlayerCard, b: PlayerCard): SplitBarData[] {
  switch (tab) {
    case 'overall':
      return [
        row('rating', 'Rating', a, b, (c) => c.rating.rating, 'higher'),
        row('win', 'Match win %', a, b, (c) => c.insights.matchWinPct, 'higher', pct),
        row('race', 'Race win %', a, b, (c) => c.insights.raceFirstPct, 'higher', pct),
        row('titles', 'Titles', a, b, (c) => c.insights.titles, 'higher'),
        row('streak', 'Best streak', a, b, (c) => c.rating.bestStreak, 'higher'),
        row('played', 'Played', a, b, (c) => c.insights.totalGames, 'neutral'),
      ];
    case 'breaks':
      return [
        row('hb', 'Highest break', a, b, (c) => c.insights.highestBreak, 'higher'),
        row('b50', '50+ breaks', a, b, (c) => c.insights.breaks50, 'higher'),
        row('tons', 'Centuries', a, b, (c) => c.insights.centuries, 'higher'),
        row('max', '147s', a, b, (c) => c.insights.maximums, 'higher'),
        row('ppf', 'Points / frame', a, b, (c) => c.insights.pointsPerFrame, 'higher'),
        row('fpf', 'Fouls / frame', a, b, (c) => c.insights.foulsPerFrame, 'lower'),
      ];
    case 'pace':
      return [
        row(
          'avg',
          'Avg frame',
          a,
          b,
          timed((c) => c.insights.avgFrameSeconds),
          'neutral',
          time,
        ),
        row(
          'winavg',
          'Frames won',
          a,
          b,
          timed((c) => c.insights.avgWinFrameSeconds),
          'neutral',
          time,
        ),
        row(
          'fast',
          'Fastest',
          a,
          b,
          timed((c) => c.insights.fastestFrameSeconds),
          'lower',
          time,
        ),
        row(
          'slow',
          'Slowest',
          a,
          b,
          timed((c) => c.insights.slowestFrameSeconds),
          'neutral',
          time,
        ),
        row('timed', 'Timed frames', a, b, (c) => c.insights.timedFrames, 'neutral'),
        row(
          'table',
          'Table time',
          a,
          b,
          timed((c) => c.insights.totalFrameSeconds),
          'neutral',
          time,
        ),
      ];
    case 'races':
      return [
        row('races', 'Races', a, b, (c) => c.insights.racesPlayed, 'neutral'),
        row('rpct', 'Race win %', a, b, (c) => c.insights.raceFirstPct, 'higher', pct),
        row('rwins', 'Wins', a, b, (c) => c.insights.raceFirsts, 'higher'),
        row('podiums', 'Podiums', a, b, (c) => c.insights.racePodiums, 'higher'),
        row(
          'avgplace',
          'Avg finish',
          a,
          b,
          (c) => c.insights.avgRacePlace,
          'lower',
          (n) => `#${n}`,
        ),
        row('rtitles', 'Race titles', a, b, (c) => c.insights.raceTitles, 'higher'),
      ];
  }
}
