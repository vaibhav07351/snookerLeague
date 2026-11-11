import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';

import { LiveResumeCard } from '@/features/home/components/LiveResumeCard';
import {
  groupResumeCopy,
  matchResumeCopy,
  raceResumeCopy,
  type LiveSessionSet,
} from '@/features/home/hooks/use-live-sessions';
import { formatDayAndTime } from '@/shared/utils/datetime';

interface LiveSessionCardsProps {
  sessions: LiveSessionSet;
  nameOf: (id: string) => string;
  /** Idle games: quiet cards with a line saying when they were started. */
  stale?: boolean;
  /** Runs before navigating, e.g. to close the drawer. */
  onBeforeOpen?: () => void;
}

/** One resume card per unfinished match, race and free-for-all, in that order. */
export function LiveSessionCards({
  sessions,
  nameOf,
  stale = false,
  onBeforeOpen,
}: LiveSessionCardsProps): ReactNode {
  const open = (href: Href): void => {
    onBeforeOpen?.();
    router.push(href);
  };
  const eyebrow = (kind: string): string => (stale ? `Unfinished ${kind}` : `Live ${kind}`);
  // Idle games can be days old, so say when they were started (own line: the eyebrow is short).
  const startedNote = (createdAt: string): string | undefined => {
    const started = stale ? formatDayAndTime(createdAt) : '';
    return started ? `Started ${started}` : undefined;
  };

  return (
    <>
      {sessions.matches.map((m) => {
        const copy = matchResumeCopy(m, nameOf);
        return (
          <LiveResumeCard
            key={m.id}
            eyebrow={eyebrow('match')}
            title={copy.title}
            meta={copy.meta}
            note={startedNote(m.createdAt)}
            stale={stale}
            onPress={() => open(`/match/${m.id}`)}
          />
        );
      })}
      {sessions.races.map((r) => {
        const copy = raceResumeCopy(r, nameOf);
        return (
          <LiveResumeCard
            key={r.id}
            eyebrow={eyebrow('race')}
            title={copy.title}
            meta={copy.meta}
            note={startedNote(r.createdAt)}
            stale={stale}
            onPress={() => open(`/race/${r.id}`)}
          />
        );
      })}
      {sessions.groups.map((g) => {
        const copy = groupResumeCopy(g, nameOf);
        return (
          <LiveResumeCard
            key={g.id}
            eyebrow={eyebrow('free-for-all')}
            title={copy.title}
            meta={copy.meta}
            note={startedNote(g.createdAt)}
            stale={stale}
            onPress={() => open(`/group/${g.id}`)}
          />
        );
      })}
    </>
  );
}
