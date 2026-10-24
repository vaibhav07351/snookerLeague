import {
  Drawer,
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { Redirect, router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { BrandLogo } from '@/features/home/components/BrandLogo';
import { BrandWordmark } from '@/features/home/components/BrandWordmark';
import { LiveResumeCard } from '@/features/home/components/LiveResumeCard';
import {
  matchResumeCopy,
  raceResumeCopy,
  useLiveSessions,
} from '@/features/home/hooks/use-live-sessions';
import { useLayout } from '@/shared/hooks/use-layout';
import { HeaderBack } from '@/shared/ui/HeaderBack';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

function ProfileButton(): ReactNode {
  const styles = useStyles(makeStyles);
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
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { league, user } = useSession();
  const active = props.state.routes[props.state.index]?.name;
  const { matches: liveMatches, races: liveRaces, nameOf } = useLiveSessions(league?.id);

  const items: Array<{ label: string; route: string; hint: string }> = [
    { label: 'Home', route: '(tabs)', hint: 'Tabs · city & club' },
    { label: 'Game history', route: 'history', hint: 'Matches & races' },
    { label: 'Champion history', route: 'champions', hint: 'Titles & race kings' },
    { label: 'Stats', route: 'stats', hint: 'Rating, breaks & rivals' },
    { label: 'Leaderboard', route: 'leaderboard', hint: "Who's hot" },
    { label: 'Players', route: 'players/index', hint: 'Roster & guests' },
    { label: 'League', route: 'league', hint: 'Invite friends · settings' },
  ];

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.drawerContent}
      style={styles.drawer}
    >
      <View style={styles.drawerHero}>
        <BrandLogo size={56} />
        <BrandWordmark size="sm" />
        <Text style={styles.drawerLeague}>{league?.name ?? 'Your league'}</Text>
        <Text style={styles.drawerUser}>Hey {user?.displayName ?? 'player'}</Text>
        <Text style={styles.drawerHint}>Club tools</Text>
      </View>

      {liveMatches.map((m) => {
        const copy = matchResumeCopy(m, nameOf);
        return (
          <View key={m.id} style={styles.resumeWrap}>
            <LiveResumeCard
              eyebrow="Live match"
              title={copy.title}
              meta={copy.meta}
              onPress={() => {
                props.navigation.closeDrawer();
                router.push(`/match/${m.id}`);
              }}
            />
          </View>
        );
      })}
      {liveRaces.map((r) => {
        const copy = raceResumeCopy(r, nameOf);
        return (
          <View key={r.id} style={styles.resumeWrap}>
            <LiveResumeCard
              eyebrow="Live race"
              title={copy.title}
              meta={copy.meta}
              onPress={() => {
                props.navigation.closeDrawer();
                router.push(`/race/${r.id}`);
              }}
            />
          </View>
        );
      })}

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
            activeBackgroundColor={palette.cardHighlight}
            activeTintColor={palette.primary}
            inactiveTintColor={palette.text}
            style={styles.item}
            onPress={() => {
              if (item.route === '(tabs)') {
                // The tabs remember their last tab (e.g. Profile); Home always opens the Home tab.
                props.navigation.navigate('(tabs)', { screen: 'index' });
                return;
              }
              props.navigation.navigate(item.route as never);
            }}
          />
        );
      })}
      <DrawerItem
        label={() => (
          <View>
            <Text style={styles.itemLabel}>Appearance</Text>
            <Text style={styles.itemHint}>Choose a colour theme</Text>
          </View>
        )}
        inactiveTintColor={palette.text}
        style={styles.item}
        onPress={() => {
          props.navigation.closeDrawer();
          router.push('/settings/theme');
        }}
      />
    </DrawerContentScrollView>
  );
}

const DETAIL_BACK = { headerLeft: () => <HeaderBack fallback="/(main)" /> } as const;

export default function MainDrawerLayout(): ReactNode {
  const palette = usePalette();
  const { width } = useLayout();
  const { ready, user, league } = useSession();
  // Signed out, or no league left (e.g. deleted on another phone): go through the start
  // gate (login / onboarding) instead of showing blank screens.
  if (ready && (!user || !league)) {
    return <Redirect href="/" />;
  }
  return (
    <Drawer
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: palette.bgElevated },
        headerTintColor: palette.text,
        headerTitleStyle: { fontFamily: fonts.bodyBold, fontSize: 17 },
        headerShadowVisible: false,
        drawerStyle: {
          backgroundColor: palette.bg,
          // Cap drawer so it never exceeds narrow phones (~320-360 CSS px).
          width: Math.min(300, Math.round(width * 0.86)),
        },
        headerRight: () => <ProfileButton />,
      }}
    >
      <Drawer.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
      <Drawer.Screen name="history" options={{ title: 'Game history' }} />
      <Drawer.Screen name="champions" options={{ title: 'Champion history' }} />
      <Drawer.Screen name="stats" options={{ title: 'Stats' }} />
      <Drawer.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Drawer.Screen
        name="compare"
        options={{ ...DETAIL_BACK, title: 'Compare', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen name="players/index" options={{ title: 'Players' }} />
      <Drawer.Screen
        name="players/[id]"
        options={{ ...DETAIL_BACK, title: 'Player', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="directory"
        options={{ ...DETAIL_BACK, title: 'Directory', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="city-player"
        options={{ ...DETAIL_BACK, title: 'Player', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen
        name="follows"
        options={{ ...DETAIL_BACK, title: 'Follows', drawerItemStyle: { display: 'none' } }}
      />
      <Drawer.Screen name="league" options={{ title: 'League' }} />
    </Drawer>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    drawer: {
      backgroundColor: c.bg,
    },
    drawerContent: {
      paddingTop: spacing.md,
    },
    drawerHero: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      gap: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      marginBottom: spacing.sm,
    },
    resumeWrap: {
      paddingHorizontal: spacing.sm,
    },
    drawerLeague: {
      fontFamily: fonts.bodyMedium,
      color: c.primarySoft,
      fontSize: 14,
    },
    drawerUser: {
      fontFamily: fonts.body,
      color: c.textMuted,
      marginTop: spacing.xs,
    },
    drawerHint: {
      fontFamily: fonts.bodyBold,
      fontSize: 11,
      letterSpacing: 1,
      color: c.primary,
      marginTop: spacing.sm,
      textTransform: 'uppercase',
    },
    item: {
      borderRadius: radii.md,
      marginHorizontal: spacing.sm,
    },
    itemLabel: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    itemLabelOn: {
      color: c.primarySoft,
    },
    itemHint: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    avatarBtn: {
      marginRight: spacing.md,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.primarySoft,
    },
    avatarText: {
      fontFamily: fonts.bodyBold,
      color: c.onPrimary,
      fontSize: 16,
    },
  });
