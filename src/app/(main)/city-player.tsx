import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { divisionLabel } from '@/features/auth/services/division.service';
import { useSession } from '@/features/auth/hooks/use-session';
import { useFollowGraph } from '@/features/community/hooks/use-follow-graph';
import * as challengeService from '@/features/community/services/challenge.service';
import * as followService from '@/features/community/services/follow.service';
import * as profileService from '@/features/community/services/profile.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as cityHubService from '@/features/league/services/city-hub.service';
import * as playersService from '@/features/players/services/players.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import { getStore } from '@/shared/storage/local-store';
import type { PlayerProfile } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function CityPlayerScreen(): ReactNode {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user } = useSession();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const graph = useFollowGraph(uid ?? null);

  const reload = useCallback(async () => {
    if (!uid) {
      return;
    }
    setProfile(await profileService.getPublicProfile(uid));
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
      Alert.alert('Could not update follow', toUserMessage(error));
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
      Alert.alert('Challenge sent', 'They will see it in Community.');
    } catch (error) {
      Alert.alert('Could not challenge', toUserMessage(error));
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
        Alert.alert('Not in your city hub yet', 'Send a challenge instead.');
        return;
      }
      router.push(`/match/new?leagueId=${hub.id}&opponentPlayerId=${opponent.id}`);
    } catch (error) {
      Alert.alert('Could not start match', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <Screen>
        <Text style={typography.subtitle}>Loading profile…</Text>
      </Screen>
    );
  }

  const mine = user?.uid === profile.uid;

  return (
    <Screen>
      <Text style={typography.label}>{profile.cityName ?? 'Player'}</Text>
      <Text style={typography.title}>{profile.displayName}</Text>
      <Text style={styles.division}>{divisionLabel(profile.division)}</Text>
      <Text style={styles.followMeta}>
        {graph.followers.length} followers · {graph.following.length} following
      </Text>
      <View style={styles.grid}>
        <Stat label="Win %" value={`${profile.winPct}`} />
        <Stat label="Played" value={`${profile.played}`} />
        <Stat label="Titles" value={`${profile.titles}`} />
        <Stat label="Highest break" value={`${profile.highestBreak || '—'}`} />
        <Stat label="50+" value={`${profile.breaks50}`} />
        <Stat label="Centuries" value={`${profile.centuries}`} />
        <Stat label="147s" value={`${profile.maximums}`} />
      </View>
      {!mine && user ? (
        <View style={styles.actions}>
          <Button
            label={following ? 'Following' : 'Follow'}
            variant={following ? 'secondary' : 'primary'}
            onPress={() => void toggleFollow()}
            disabled={busy}
            loading={busy}
          />
          {user.cityId ? (
            <>
              <Button
                label="Challenge"
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
  return (
    <View style={styles.stat}>
      <Text style={typography.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  stat: {
    width: '47%',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  value: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 20,
  },
  division: {
    fontFamily: fonts.bodyMedium,
    color: colors.goldSoft,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  followMeta: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
