import {
  LibreBaskerville_400Regular,
  LibreBaskerville_700Bold,
} from '@expo-google-fonts/libre-baskerville';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider } from '@/features/auth/hooks/use-session';
import { WEB_SHELL_MAX_WIDTH } from '@/shared/hooks/use-layout';
import { HeaderBack } from '@/shared/ui/HeaderBack';
import { SyncBanner } from '@/shared/ui/SyncBanner';
import { ToastHost } from '@/shared/ui/ToastHost';
import { ThemeProvider, usePalette } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout(): ReactNode {
  const [fontsLoaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Fallback web shell styles when +html.tsx reset is not present (some export paths).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }
    const id = 'snookit-web-shell';
    if (document.getElementById(id)) {
      return;
    }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = [
      'html,body,#root{height:100%;overscroll-behavior:none}',
      'body{margin:0;overflow:hidden}',
      `#root{display:flex;max-width:${WEB_SHELL_MAX_WIDTH}px;margin-left:auto;margin-right:auto;width:100%;overflow:hidden}`,
    ].join('');
    document.head.appendChild(style);
  }, []);

  return (
    <ThemeProvider>
      <AppShell fontsLoaded={fontsLoaded} />
    </ThemeProvider>
  );
}

function AppShell({ fontsLoaded }: { fontsLoaded: boolean }): ReactNode {
  const palette = usePalette();

  if (!fontsLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: palette.bg }]}>
        <ActivityIndicator color={palette.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: palette.bg }]}>
      <SessionProvider>
        <StatusBar style={palette.isDark ? 'light' : 'dark'} />
        <SyncBanner />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.bgElevated },
            headerTintColor: palette.text,
            headerTitleStyle: {
              fontFamily: fonts.bodyBold,
              fontSize: 17,
            },
            headerBackTitleStyle: { fontFamily: fonts.body },
            contentStyle: { backgroundColor: palette.bg },
            headerShadowVisible: false,
            headerBackVisible: false,
            headerLeft: () => <HeaderBack />,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="birthday" options={{ headerShown: false }} />
          <Stack.Screen name="location" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
          <Stack.Screen name="match/new" options={{ title: 'New match' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
          <Stack.Screen name="race/new" options={{ title: 'New race' }} />
          <Stack.Screen name="race/[id]" options={{ title: 'Race' }} />
          <Stack.Screen name="join/[code]" options={{ title: 'Join league' }} />
          <Stack.Screen name="settings/theme" options={{ title: 'Appearance' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        </Stack>
        <ToastHost />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
  },
  root: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          // Phone-width shell on desktop web; native unchanged.
          width: '100%' as const,
          maxWidth: WEB_SHELL_MAX_WIDTH,
          alignSelf: 'center' as const,
          overflow: 'hidden' as const,
        }
      : {}),
  },
});
