import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { colors } from '@/theme/tokens';

export default function Index(): ReactNode {
  const { ready, user, league } = useSession();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.felt, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!league) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(main)" />;
}
