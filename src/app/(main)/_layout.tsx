import {
  Drawer,
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

function ProfileButton(): ReactNode {
  const { user } = useSession();
  const initial = (user?.displayName?.trim().charAt(0) ?? '?').toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      onPress={() => router.push('/(main)/profile')}
      style={styles.avatarBtn}
    >
      <Text style={styles.avatarText}>{initial}</Text>
    </Pressable>
  );
}

function CustomDrawer(props: DrawerContentComponentProps): ReactNode {
  const { league, user } = useSession();
  const active = props.state.routes[props.state.index]?.name;

  const items: Array<{ label: string; route: string; hint: string }> = [
    { label: 'Home', route: 'index', hint: 'Champs & quick play' },
    { label: 'Game history', route: 'history', hint: 'Matches & races' },
    { label: 'Champion history', route: 'champions', hint: 'Titles & race kings' },
    { label: 'Stats', route: 'stats', hint: 'Charts & form' },
    { label: 'Leaderboard', route: 'leaderboard', hint: "Who's hot" },
    { label: 'Players', route: 'players/index', hint: 'Roster & guests' },
    { label: 'League', route: 'league', hint: 'Invite · settings' },
  ];

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.drawerContent}
      style={styles.drawer}
    >
      <View style={styles.drawerHero}>
        <BrandLogo size={56} />
        <Text style={styles.drawerBrand}>Snooker</Text>
        <Text style={styles.drawerLeague}>{league?.name ?? 'Your league'}</Text>
        <Text style={styles.drawerUser}>Hey {user?.displayName ?? 'player'}</Text>
      </View>

      {items.map((item) => {
        const focused = active === item.route;
        return (
          <DrawerItem
            key={item.route}
            label={() => (
              <View>
                <Text style={[styles.itemLabel, focused && styles.itemLabelOn]}>{item.label}</Text>
                <Text style={styles.itemHint}>{item.hint}</Text>
              </View>
            )}
            focused={focused}
            activeBackgroundColor={colors.surfaceBright}
            activeTintColor={colors.gold}
            inactiveTintColor={colors.chalk}
            style={styles.item}
            onPress={() => {
              props.navigation.navigate(item.route as never);
            }}
          />
        );
      })}
    </DrawerContentScrollView>
  );
}

export default function MainDrawerLayout(): ReactNode {
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.feltMid },
        headerTintColor: colors.chalk,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        drawerStyle: { backgroundColor: colors.felt, width: 300 },
        headerRight: () => <ProfileButton />,
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'Home', drawerLabel: 'Home' }} />
      <Drawer.Screen name="history" options={{ title: 'Game history' }} />
      <Drawer.Screen name="champions" options={{ title: 'Champion history' }} />
      <Drawer.Screen name="stats" options={{ title: 'Stats' }} />
      <Drawer.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Drawer.Screen name="players/index" options={{ title: 'Players' }} />
      <Drawer.Screen
        name="players/[id]"
        options={{ title: 'Player', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="profile"
        options={{ title: 'My profile', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen name="league" options={{ title: 'League' }} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: colors.felt,
  },
  drawerContent: {
    paddingTop: spacing.md,
  },
  drawerHero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  drawerBrand: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.chalk,
    marginTop: spacing.sm,
  },
  drawerLeague: {
    fontFamily: fonts.bodyMedium,
    color: colors.goldSoft,
    fontSize: 14,
  },
  drawerUser: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginTop: spacing.xs,
  },
  item: {
    borderRadius: radii.md,
    marginHorizontal: spacing.sm,
  },
  itemLabel: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  itemLabelOn: {
    color: colors.goldSoft,
  },
  itemHint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  avatarBtn: {
    marginRight: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.goldSoft,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 16,
  },
});
