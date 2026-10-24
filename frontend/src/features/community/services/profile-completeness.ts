import type { Player, SessionUser } from '@/shared/types/domain';

export interface CompletenessItem {
  id: string;
  label: string;
  done: boolean;
  href?: string;
}

export interface Completeness {
  percent: number;
  items: CompletenessItem[];
}

export function profileCompleteness(user: SessionUser, player: Player | null): Completeness {
  const played = (player?.stats.standard.played ?? 0) + (player?.stats.race.played ?? 0) > 0;
  const items: CompletenessItem[] = [
    {
      id: 'city',
      label: 'City',
      done: Boolean(user.cityId),
      href: '/location',
    },
    {
      id: 'dob',
      label: 'Date of birth',
      done: Boolean(user.dateOfBirth),
      href: '/birthday',
    },
    {
      id: 'account',
      label: 'Google backup',
      done: !user.isDemo,
    },
    {
      id: 'played',
      label: 'Log a match or race',
      done: played,
      href: '/match/new',
    },
  ];
  const doneCount = items.filter((item) => item.done).length;
  return {
    percent: Math.round((doneCount / items.length) * 100),
    items,
  };
}
