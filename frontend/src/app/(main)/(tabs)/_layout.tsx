import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, type ColorValue } from 'react-native';

import { useChallengeBadge } from '@/features/community/hooks/use-challenge-badge';
import { TourTarget } from '@/features/tour/components/TourTarget';
import { usePalette } from '@/theme/ThemeProvider';
import { fonts, typeScale } from '@/theme/tokens';

type IonName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IonName) {
  return ({ color, size }: { color: ColorValue; size: number; focused: boolean }): ReactNode => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function MainTabsLayout(): ReactNode {
  const palette = usePalette();
  const challenges = useChallengeBadge();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.bgElevated },
        headerTintColor: palette.text,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: typeScale.headline },
        headerShadowVisible: false,
        // The background fills the whole tab bar: a measurable spot for the app tour.
        tabBarBackground: () => <TourTarget id="nav.tabs" style={StyleSheet.absoluteFill} />,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: typeScale.micro },
        tabBarBadgeStyle: {
          backgroundColor: palette.danger,
          fontFamily: fonts.bodyBold,
          fontSize: typeScale.micro,
        },
        tabBarStyle: {
          backgroundColor: palette.bgElevated,
          borderTopColor: palette.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen
        name="looking"
        options={{ title: 'Looking', tabBarIcon: tabIcon('search-outline') }}
      />
      <Tabs.Screen
        name="my-snooker"
        options={{
          title: 'My Snooker',
          tabBarLabel: 'My Snooker',
          tabBarIcon: tabIcon('trophy-outline'),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: tabIcon('people-outline'),
          // Challenges waiting for my answer.
          tabBarBadge: challenges > 0 ? challenges : undefined,
          tabBarAccessibilityLabel:
            challenges > 0
              ? `Community, ${challenges} ${challenges === 1 ? 'challenge' : 'challenges'} waiting`
              : 'Community',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
