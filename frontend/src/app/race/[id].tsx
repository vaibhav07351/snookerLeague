import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { RaceScreen } from '@/features/race/screens/RaceScreen';

export default function RaceRoute(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RaceScreen raceId={id} />;
}
