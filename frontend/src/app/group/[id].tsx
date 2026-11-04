import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import { GroupMatchScreen } from '@/features/group/screens/GroupMatchScreen';

export default function GroupMatchRoute(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupMatchScreen groupId={id} />;
}
