import type { PlayerCard } from '@/features/stats/hooks/use-player-card';
import type { RivalRow } from '@/features/stats/services/head-to-head.service';
import type { ChartTone } from '@/features/stats/services/insights.service';
import type { LeagueRecord } from '@/features/stats/services/records.service';
import { formatDurationCompact } from '@/shared/utils/datetime';

export type DashboardTab = 'overview' | 'breaks' | 'pace' | 'rivals' | 'records';
export type DetailKey = 'rating' | 'results' | 'races' | 'pace' | 'scoring';

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  overview: 'Overview',
  breaks: 'Breaks',
  pace: 'Pace',
  rivals: 'Rivals',
  records: 'Records',
};

/** A tile before it is painted: what it says and what tapping it does. */
export interface DashboardTile {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone: ChartTone;
  /** Opens a detail sheet. */
  detail?: DetailKey;
  /** Opens Compare against this player. */
  compareWith?: string;
  /** Opens this player's page. */
  openPlayer?: string;
}

/** Duration for a tile; a plain hyphen when there is nothing timed yet. */
export function duration(seconds: number | null | undefined): string {
  return seconds == null || seconds <= 0 ? '-' : formatDurationCompact(seconds);
}

function orDash(n: number | null | undefined): string {
  return n == null ? '-' : String(n);
}

function rivalTile(
  key: string,
  label: string,
  row: RivalRow | null,
  nameOf: (id: string) => string,
  hint: (row: RivalRow) => string,
  emptyHint: string,
  tone: ChartTone,
): DashboardTile {
  if (!row) {
    return { key, label, value: '-', hint: emptyHint, tone };
  }
  return {
    key,
    label,
    value: nameOf(row.playerId),
    hint: hint(row),
    tone,
    compareWith: row.playerId,
  };
}

export function dashboardTiles(
  tab: DashboardTab,
  card: PlayerCard,
  nameOf: (id: string) => string,
  records: LeagueRecord[],
): DashboardTile[] {
  const i = card.insights;
  const r = card.rating;
  switch (tab) {
    case 'overview':
      return [
        {
          key: 'rating',
          label: 'Rating',
          value: String(r.rating),
          hint: r.games > 0 ? `Peak ${r.peak} · ${r.games} results` : 'Play to get rated',
          tone: 'primary',
          detail: 'rating',
        },
        {
          key: 'win',
          label: 'Match win %',
          value: `${i.matchWinPct}%`,
          hint: `${i.matchWins}W ${i.matchLosses}L`,
          tone: 'success',
          detail: 'results',
        },
        {
          key: 'race',
          label: 'Race win %',
          value: `${i.raceFirstPct}%`,
          hint: `${i.raceFirsts} wins · ${i.racePodiums} podiums`,
          tone: 'info',
          detail: 'races',
        },
        {
          key: 'titles',
          label: 'Titles',
          value: String(i.titles),
          hint: `${i.titles - i.raceTitles} match · ${i.raceTitles} race`,
          tone: 'accent',
        },
        {
          key: 'streak',
          label: 'Win streak',
          value: String(r.currentStreak),
          hint: `Best ever ${r.bestStreak}`,
          tone: 'warning',
        },
        {
          key: 'played',
          label: 'Played',
          value: String(i.totalGames),
          hint: `${i.matchesPlayed} matches · ${i.racesPlayed} races`,
          tone: 'teamA',
        },
      ];
    case 'breaks':
      return [
        {
          key: 'hb',
          label: 'Highest break',
          value: i.highestBreak > 0 ? String(i.highestBreak) : '-',
          hint: i.highestBreak > 0 ? 'From the shot log' : 'Pot balls live to log breaks',
          tone: 'primary',
        },
        { key: 'b50', label: '50+ breaks', value: String(i.breaks50), tone: 'info' },
        { key: 'tons', label: 'Centuries', value: String(i.centuries), tone: 'accent' },
        { key: 'max', label: '147s', value: String(i.maximums), tone: 'warning' },
        {
          key: 'ppf',
          label: 'Points / frame',
          value: orDash(i.pointsPerFrame),
          hint: `${i.pointsScored} pts in ${i.framesPlayed} frames`,
          tone: 'success',
          detail: 'scoring',
        },
        {
          key: 'fpf',
          label: 'Fouls / frame',
          value: orDash(i.foulsPerFrame),
          hint: `${i.foulPoints} pts given away`,
          tone: 'danger',
          detail: 'scoring',
        },
      ];
    case 'pace':
      return [
        {
          key: 'avg',
          label: 'Avg frame',
          value: duration(i.avgFrameSeconds),
          hint: i.timedFrames > 0 ? `${i.timedFrames} timed frames` : 'Turn on auto-time',
          tone: 'warning',
          detail: 'pace',
        },
        {
          key: 'winavg',
          label: 'Frames won',
          value: duration(i.avgWinFrameSeconds),
          hint: 'Average length',
          tone: 'success',
          detail: 'pace',
        },
        {
          key: 'lossavg',
          label: 'Frames lost',
          value: duration(i.avgLossFrameSeconds),
          hint: 'Average length',
          tone: 'teamB',
          detail: 'pace',
        },
        { key: 'fast', label: 'Fastest', value: duration(i.fastestFrameSeconds), tone: 'info' },
        { key: 'slow', label: 'Slowest', value: duration(i.slowestFrameSeconds), tone: 'accent' },
        {
          key: 'table',
          label: 'Table time',
          value: duration(i.totalFrameSeconds),
          tone: 'primary',
        },
      ];
    case 'rivals':
      return [
        rivalTile(
          'partner',
          'Best partner',
          card.rivals.bestPartner,
          nameOf,
          (row) => `${row.wins}W ${row.losses}L together`,
          'Play 2 doubles together',
          'success',
        ),
        rivalTile(
          'nemesis',
          'Nemesis',
          card.rivals.nemesis,
          nameOf,
          (row) => `Lost ${row.losses} of ${row.played}`,
          'Nobody has your number',
          'danger',
        ),
        rivalTile(
          'favourite',
          'Favourite opponent',
          card.rivals.favouriteOpponent,
          nameOf,
          (row) => `Won ${row.wins} of ${row.played}`,
          'Win twice against someone',
          'info',
        ),
        rivalTile(
          'most',
          'Most played',
          card.rivals.mostPlayed,
          nameOf,
          (row) => `${row.played} meetings · ${row.wins}W ${row.losses}L`,
          'No matches yet',
          'accent',
        ),
      ];
    case 'records':
      return records.map((rec) => ({
        key: rec.key,
        label: rec.label,
        value: rec.value,
        hint: rec.holderName ?? 'Up for grabs',
        tone: 'primary',
        openPlayer: rec.holderId ?? undefined,
      }));
  }
}
