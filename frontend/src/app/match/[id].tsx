import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { MatchScreen } from '@/features/match/screens/MatchScreen';

export default function MatchRoute(): ReactNode {
  const { id, midway } = useLocalSearchParams<{ id: string; midway?: string }>();
  return <MatchScreen matchId={id} startMidway={midway === '1'} />;
}
