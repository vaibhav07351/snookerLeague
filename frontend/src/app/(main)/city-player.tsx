import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { divisionLabel } from '@/features/auth/services/division.service';
import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import * as challengeService from '@/features/community/services/challenge.service';
import * as followService from '@/features/community/services/follow.service';
import * as profileService from '@/features/community/services/profile.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as cityHubService from '@/features/league/services/city-hub.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useLayout } from '@/shared/hooks/use-layout';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore } from '@/shared/storage/local-store';
import type { PlayerProfile } from '@/shared/types/domain';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

type LoadState = 'loading' | 'missing' | 'ready';

export default function CityPlayerScreen(): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const { scale } = useLayout();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user } = useSession();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const graph = useFollowGraph(uid ?? null);

  const reload = useCallback(async () => {
    if (!uid) {
      return;
    }
    const next = await profileService.getPublicProfile(uid);
    setProfile(next);
    setLoadState(next ? 'ready' : 'missing');
    const currentUid = getStore().user?.uid;
    setFollowing(currentUid ? followService.isFollowing(currentUid, uid) : false);
  }, [uid]);

  useStoreReload(reload, uid ?? null);

  async function toggleFollow(): Promise<void> {
    if (!uid) {
      return;
    }
    setBusy(true);
    try {
      if (following) {
        await followService.unfollowPlayer(uid);
        setFollowing(false);
      } else {
        await followService.followPlayer(uid);
        setFollowing(true);
      }
    } catch (error) {
      notify.error('Could not update follow', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function challenge(): Promise<void> {
    if (!user?.cityId || !uid) {
      return;
    }
    setBusy(true);
    try {
      await challengeService.createChallenge({ toUid: uid, cityId: user.cityId });
      notify.success('Challenge sent', 'They will see it in Community.');
    } catch (error) {
      notify.error('Could not challenge', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function setupMatch(): Promise<void> {
    if (!user || !uid) {
      return;
    }
    setBusy(true);
    try {
      const hub = await cityHubService.getCityHubForUser(user.uid);
      if (!hub) {
        throw new Error('Join your city first');
      }
      const roster = await playersService.listPlayers(hub.id);
      const opponent = roster.find((p) => p.authUid === uid);
      if (!opponent) {
        notify.info('Not in your city hub yet', 'Send a challenge instead.');
        return;
      }
      router.push(`/match/new?leagueId=${hub.id}&opponentPlayerId=${opponent.id}`);
    } catch (error) {
      notify.error('Could not start match', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <Screen>
        {loadState === 'missing' ? (
          <EmptyState
            icon="person-outline"
            title="Profile not found"
            message="This player may have left the city or made their profile private."
          />
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.primary} />
            <Text style={typography.subtitle}>Loading profile</Text>
          </View>
        )}
      </Screen>
    );
  }

  const mine = user?.uid === profile.uid;

  return (
    <Screen>
      <Text style={typography.label} numberOfLines={1}>
        {profile.cityName ?? 'Player'}
      </Text>
      <Text style={typography.title} numberOfLines={2}>
        {profile.displayName}
      </Text>
      <Text style={styles.division}>{divisionLabel(profile.division)}</Text>
      <View style={styles.followRow}>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.push(`/(main)/follows?uid=${profile.uid}&kind=followers`)}
        >
          <Text style={styles.followMeta}>
            <Text style={styles.followCount}>{graph.followers.length}</Text> followers
          </Text>
        </Pressable>
        <Text style={styles.followMeta}>·</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.push(`/(main)/follows?uid=${profile.uid}&kind=following`)}
        >
          <Text style={styles.followMeta}>
            <Text style={styles.followCount}>{graph.following.length}</Text> following
          </Text>
        </Pressable>
      </View>

      <Card tone="highlight" style={styles.breakCard}>
        <Text style={typography.label}>Highest break</Text>
        <Text style={[styles.breakValue, { fontSize: scale(48), lineHeight: scale(56) }]}>
          {profile.highestBreak > 0 ? String(profile.highestBreak) : '-'}
        </Text>
        <View style={styles.grid}>
          <Stat label="50+" value={`${profile.breaks50}`} />
          <Stat label="Centuries" value={`${profile.centuries}`} />
          <Stat label="147s" value={`${profile.maximums}`} />
        </View>
      </Card>

      <View style={styles.grid}>
        <Stat label="Win %" value={`${profile.winPct}`} />
        <Stat label="Played" value={`${profile.played}`} />
        <Stat label="Titles" value={`${profile.titles}`} />
      </View>

      {!mine && user ? (
        <View style={styles.actions}>
          <Button
            label={following ? 'Following' : 'Follow'}
            icon={following ? 'checkmark' : 'person-add-outline'}
            variant={following ? 'secondary' : 'primary'}
            onPress={() => void toggleFollow()}
            disabled={busy}
            loading={busy}
          />
          {user.cityId ? (
            <>
              <Button
                label="Challenge"
                icon="flash-outline"
                variant="secondary"
                onPress={() => void challenge()}
                disabled={busy}
              />
              <Button
                label="Setup match"
                variant="ghost"
                onPress={() => void setupMatch()}
                disabled={busy}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  return (
    <View style={styles.stat}>
      <Text style={typography.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    division: {
      fontFamily: fonts.bodyMedium,
      color: c.primary,
      fontSize: 15,
      marginTop: spacing.xs,
    },
    followRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    followMeta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
    },
    followCount: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    breakCard: {
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    breakValue: {
      fontFamily: fonts.display,
      color: c.primary,
      textAlign: 'center',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
      alignSelf: 'stretch',
    },
    stat: {
      flexGrow: 1,
      flexBasis: 90,
      minWidth: 0,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    value: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 20,
    },
    actions: {
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
  });
