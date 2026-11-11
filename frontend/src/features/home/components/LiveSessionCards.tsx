import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';

import { LiveResumeCard } from '@/features/home/components/LiveResumeCard';
import {
  groupResumeCopy,
  matchResumeCopy,
  raceResumeCopy,
  type LiveSessionSet,
} from '@/features/home/hooks/use-live-sessions';
import { formatLastMatchDay } from '@/shared/utils/datetime';

interface LiveSessionCardsProps {
  sessions: LiveSessionSet;
  nameOf: (id: string) => string;
  /** Idle games: quiet cards whose label says when they were last played. */
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
  const eyebrow = (kind: string, updatedAt: string): string =>
    stale ? `Unfinished ${kind} · ${formatLastMatchDay(updatedAt)}` : `Live ${kind}`;

  return (
    <>
      {sessions.matches.map((m) => {
        const copy = matchResumeCopy(m, nameOf);
        return (
          <LiveResumeCard
            key={m.id}
            eyebrow={eyebrow('match', m.updatedAt)}
            title={copy.title}
            meta={copy.meta}
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
            eyebrow={eyebrow('race', r.updatedAt)}
            title={copy.title}
            meta={copy.meta}
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
            eyebrow={eyebrow('free-for-all', g.updatedAt)}
            title={copy.title}
            meta={copy.meta}
            stale={stale}
            onPress={() => open(`/group/${g.id}`)}
          />
        );
      })}
    </>
  );
}
