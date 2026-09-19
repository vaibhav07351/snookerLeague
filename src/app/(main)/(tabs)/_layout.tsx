import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { DrawerToggleButton } from 'expo-router/drawer';
import type { ComponentProps, ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

type IonName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IonName) {
  return ({ color, size }: { color: ColorValue; size: number; focused: boolean }): ReactNode => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function MainTabsLayout(): ReactNode {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.feltMid },
        headerTintColor: colors.chalk,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        headerLeft: () => <DrawerToggleButton tintColor={colors.chalk} />,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.chalkMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
        tabBarStyle: {
          backgroundColor: colors.feltMid,
          borderTopColor: colors.border,
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
        options={{ title: 'Community', tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
