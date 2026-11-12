import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { groupStandings } from '@/features/group/services/group-frame-engine';
import { startedAtOf, type HistoryItem } from '@/features/history/services/history.service';
import * as matchService from '@/features/match/services/match.service';
import * as raceService from '@/features/race/services/race.service';
import type { Match } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { formatGameStart, withDuration } from '@/shared/utils/datetime';
import { totalFrameSeconds } from '@/shared/utils/frame-time';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

/** "3-1", "2-1 live", or the score when a side forfeited (with frame points if any). */
function matchScore(m: Match): string {
  if (m.outcome.status === 'in_progress') {
    return `${m.outcome.framesA}-${m.outcome.framesB} live`;
  }
  if (m.outcome.status === 'forfeited') {
    const f = m.outcome.scoreAtForfeit;
    const pts =
      (f.framePointsA ?? 0) > 0 || (f.framePointsB ?? 0) > 0
        ? ` · pts ${f.framePointsA ?? 0}-${f.framePointsB ?? 0}`
        : '';
    return `${f.framesA}-${f.framesB}${pts}`;
  }
  return `${m.outcome.framesA}-${m.outcome.framesB}`;
}

interface RowView {
  kind: string;
  tone: 'match' | 'race' | 'danger' | 'live';
  title: string;
  meta: string;
  href: `/match/${string}` | `/group/${string}` | `/race/${string}`;
}

function rowView(item: HistoryItem, nameOf: (id: string) => string): RowView {
  if (item.kind === 'match') {
    const m = item.match;
    const labels = matchService.playerNamesForMatch(m, nameOf);
    const forfeitLine = matchService.describeForfeit(m, nameOf);
    const forfeited = m.outcome.status === 'forfeited';
    const live = m.outcome.status === 'in_progress';
    const score = forfeitLine ?? matchScore(m);
    return {
      kind: forfeited ? 'FORFEIT' : live ? 'LIVE MATCH' : 'MATCH',
      tone: forfeited ? 'danger' : live ? 'live' : 'match',
      title: m.namedLabel ?? `${labels.teamA} vs ${labels.teamB}`,
      meta: live ? score : withDuration(score, totalFrameSeconds(m.frames)),
      href: `/match/${m.id}`,
    };
  }
  if (item.kind === 'group') {
    const g = item.group;
    const done = g.status === 'completed';
    const leader = groupStandings(g.frames, g.playerIds)[0];
    return {
      kind: done ? 'FREE-FOR-ALL' : 'LIVE FREE-FOR-ALL',
      tone: done ? 'match' : 'live',
      title: g.namedLabel ?? g.playerIds.map(nameOf).join(', '),
      meta: done
        ? withDuration(
            `Winner: ${g.winnerId ? nameOf(g.winnerId) : '-'}`,
            totalFrameSeconds(g.frames),
          )
        : leader && leader.framesWon > 0
          ? `${nameOf(leader.playerId)} leads on ${leader.framesWon} frame${leader.framesWon === 1 ? '' : 's'}`
          : `Frame ${g.frames.length + 1} in progress`,
      href: `/group/${g.id}`,
    };
  }
  const r = item.race;
  const winner = r.entrants.find((e) => e.place === 1);
  const done = r.status === 'completed';
  return {
    kind: done ? 'RACE' : 'LIVE RACE',
    tone: done ? 'race' : 'live',
    title: r.namedLabel ?? `Race to ${r.targetScore}`,
    meta: done
      ? withDuration(
          `1st: ${winner ? nameOf(winner.playerId) : '-'}`,
          raceService.raceDurationSeconds(r),
        )
      : 'In progress',
    href: `/race/${r.id}`,
  };
}

/** One game in the history list: kind and start time, title, and the result line. */
export function HistoryRow({
  item,
  nameOf,
}: {
  item: HistoryItem;
  nameOf: (id: string) => string;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const v = rowView(item, nameOf);
  const when = formatGameStart(startedAtOf(item), item.at);
  return (
    <Card style={styles.row} onPress={() => router.push(v.href)}>
      <View style={styles.kindRow}>
        <Text style={[styles.kind, styles[v.tone]]}>{v.kind}</Text>
        {when ? <Text style={styles.when}>{when}</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {v.title}
      </Text>
      <Text style={styles.meta}>{v.meta}</Text>
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      gap: 2,
    },
    kindRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    kind: {
      fontFamily: fonts.bodyBold,
      fontSize: typeScale.label,
      letterSpacing: 1,
    },
    match: {
      color: c.teamA,
    },
    race: {
      color: c.accent,
    },
    danger: {
      color: c.danger,
    },
    live: {
      color: c.live,
    },
    when: {
      flexShrink: 1,
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.label,
      textAlign: 'right',
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: typeScale.lead,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.small,
    },
  });
