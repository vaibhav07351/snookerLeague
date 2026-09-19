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
import { colors, fonts } from '@/theme/tokens';

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
      'html,body,#root{height:100%;background-color:#0E2A1C;overscroll-behavior:none}',
      'body{margin:0;overflow:hidden}',
      '#root{display:flex;max-width:480px;margin-left:auto;margin-right:auto;width:100%;overflow:hidden}',
    ].join('');
    document.head.appendChild(style);
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.felt, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.feltMid },
            headerTintColor: colors.chalk,
            headerTitleStyle: {
              fontFamily: fonts.bodyBold,
              fontSize: 17,
            },
            headerBackTitleStyle: { fontFamily: fonts.body },
            contentStyle: { backgroundColor: colors.felt },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="birthday" options={{ headerShown: false }} />
          <Stack.Screen name="location" options={{ headerShown: false }} />
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
          <Stack.Screen name="match/new" options={{ title: 'New match' }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
          <Stack.Screen name="race/new" options={{ title: 'New race' }} />
          <Stack.Screen name="race/[id]" options={{ title: 'Race' }} />
        </Stack>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.felt,
    ...(Platform.OS === 'web'
      ? {
          // Phone-width shell on desktop web; native unchanged.
          width: '100%' as const,
          maxWidth: 480,
          alignSelf: 'center' as const,
          overflow: 'hidden' as const,
        }
      : {}),
  },
});
