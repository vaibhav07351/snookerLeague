import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { NewMatchScreen } from '@/features/match/screens/NewMatchScreen';

export default function NewMatchRoute(): ReactNode {
  const params = useLocalSearchParams<{ opponentPlayerId?: string; leagueId?: string }>();
  return (
    <NewMatchScreen
      opponentPlayerId={
        typeof params.opponentPlayerId === 'string' ? params.opponentPlayerId : undefined
      }
      leagueId={typeof params.leagueId === 'string' ? params.leagueId : undefined}
    />
  );
}
