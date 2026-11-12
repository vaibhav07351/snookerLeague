import { Redirect, Stack } from 'expo-router';
import type { ReactNode } from 'react';

import { useSession } from '@/features/auth/hooks/use-session';
import { HeaderBack } from '@/shared/ui/HeaderBack';
import { usePalette } from '@/theme/ThemeProvider';
import { fonts, typeScale } from '@/theme/tokens';

/**
 * The signed-in app: the tabs, and the screens opened from them (My Snooker's tools, players,
 * the league). There is no side menu: My Snooker is the one place for club tools.
 */
export default function MainLayout(): ReactNode {
  const palette = usePalette();
  const { ready, user, league } = useSession();
  // Signed out, or no league left (e.g. deleted on another phone): go through the start
  // gate (login / onboarding) instead of showing blank screens.
  if (ready && (!user || !league)) {
    return <Redirect href="/" />;
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.bgElevated },
        headerTintColor: palette.text,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: typeScale.headline },
        headerShadowVisible: false,
        headerBackVisible: false,
        headerLeft: () => <HeaderBack fallback="/(main)" />,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="history" options={{ title: 'Game history' }} />
      <Stack.Screen name="champions" options={{ title: 'Champion history' }} />
      <Stack.Screen name="stats" options={{ title: 'Stats' }} />
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Stack.Screen name="compare" options={{ title: 'Compare' }} />
      <Stack.Screen name="players/index" options={{ title: 'Players' }} />
      <Stack.Screen name="players/[id]" options={{ title: 'Player' }} />
      <Stack.Screen name="directory" options={{ title: 'Directory' }} />
      <Stack.Screen name="city-player" options={{ title: 'Player' }} />
      <Stack.Screen name="follows" options={{ title: 'Follows' }} />
      <Stack.Screen name="tournaments" options={{ title: 'Tournaments' }} />
      <Stack.Screen name="league" options={{ title: 'League' }} />
    </Stack>
  );
}
