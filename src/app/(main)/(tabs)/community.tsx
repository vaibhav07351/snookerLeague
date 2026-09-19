import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import { CommunityHubTiles } from '@/features/community/components/CommunityHubTiles';
import * as challengeService from '@/features/community/services/challenge.service';
import * as profileService from '@/features/community/services/profile.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import * as cityHubService from '@/features/league/services/city-hub.service';
import * as matchService from '@/features/match/services/match.service';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { Challenge, Match, PlayerProfile } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

export default function CommunityScreen(): ReactNode {
  const { user } = useSession();
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [best, setBest] = useState<PlayerProfile | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [live, setLive] = useState<Match[]>([]);
  const [cursor, setCursor] = useState<{ rankScore: number; uid: string } | null>(null);

  const cityId = user?.cityId ?? null;

  const reload = useCallback(async () => {
    if (!user) {
      return;
    }
    const inbox = await challengeService.listMyChallenges();
    setChallenges(inbox.filter((c) => c.status === 'pending'));
    if (!cityId) {
      setProfiles([]);
      setBest(null);
      setLive([]);
      return;
    }
    const page = await profileService.listCityProfiles({ cityId });
    setProfiles(page.items);
    setCursor(page.nextCursor);
    setBest(profileService.bestInCity(page.items));
    const hub = await cityHubService.getCityHubForUser(user.uid);
    if (hub) {
      const matches = await matchService.listMatches(hub.id, { limit: 20 });
      setLive(matches.filter((m) => m.outcome.status === 'in_progress'));
    } else {
      setLive([]);
    }
  }, [cityId, user]);

  useStoreReload(reload, cityId ? `community:${cityId}:${user?.uid ?? ''}` : (user?.uid ?? null));

  async function loadMore(): Promise<void> {
    if (!cityId || !cursor) {
      return;
    }
    const page = await profileService.listCityProfiles({
      cityId,
      cursorRank: cursor.rankScore,
      cursorUid: cursor.uid,
    });
    setProfiles((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
  }

  async function onAccept(id: string): Promise<void> {
    try {
      const { match } = await challengeService.acceptChallenge(id);
      router.push(`/match/${match.id}`);
    } catch (error) {
      Alert.alert('Could not accept', toUserMessage(error));
    }
  }

  if (!user) {
    return null;
  }

  if (user.isDemo && !cityId) {
    return (
      <Screen>
        <Text style={typography.title}>Community</Text>
        <Text style={typography.subtitle}>
          Sign in with Google to see players in your city, live matches, and challenges.
        </Text>
      </Screen>
    );
  }

  if (!cityId) {
    return (
      <Screen>
        <Text style={typography.title}>Community</Text>
        <Text style={typography.subtitle}>Pick your city to see local players.</Text>
        <Button label="Choose city" onPress={() => router.push('/location')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label}>Snooker community in</Text>
      <Text style={typography.title}>{user.cityName}</Text>

      <CommunityHubTiles
        tiles={[
          {
            label: 'Looking',
            hint: 'Opponent · table · club',
            onPress: () => router.push('/(main)/looking'),
          },
          {
            label: 'Clubs',
            hint: 'Local clubs',
            onPress: () => router.push('/(main)/directory?kind=club'),
          },
          {
            label: 'Tables',
            hint: 'Venues & tables',
            onPress: () => router.push('/(main)/directory?kind=table'),
          },
          {
            label: 'Referees',
            hint: 'Officials',
            onPress: () => router.push('/(main)/directory?kind=referee'),
          },
          {
            label: 'Organisers',
            hint: 'Events & leagues',
            onPress: () => router.push('/(main)/directory?kind=organiser'),
          },
        ]}
      />

      {best ? (
        <Pressable
          style={styles.best}
          onPress={() => router.push(`/(main)/city-player?uid=${best.uid}`)}
        >
          <Text style={typography.label}>Best in {user.cityName}</Text>
          <Text style={styles.bestName}>{best.displayName}</Text>
          <Text style={styles.meta}>
            {best.winPct}% · {best.played} games · HB {best.highestBreak || '—'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>Play 3 city matches to crown a best player.</Text>
      )}

      <Text style={[typography.label, styles.section]}>Live in {user.cityName}</Text>
      {live.length === 0 ? (
        <Text style={styles.meta}>No live matches right now.</Text>
      ) : (
        live.map((m) => {
          const open = m.openFrame;
          return (
            <Pressable key={m.id} style={styles.row} onPress={() => router.push(`/match/${m.id}`)}>
              <Text style={styles.name}>{m.namedLabel ?? `Best of ${m.bestOf}`}</Text>
              <Text style={styles.meta}>
                Frames {m.outcome.framesA}–{m.outcome.framesB}
                {open ? ` · ${open.teamAPoints}–${open.teamBPoints}` : ''}
              </Text>
            </Pressable>
          );
        })
      )}

      <Text style={[typography.label, styles.section]}>Challenges</Text>
      {challenges.length === 0 ? (
        <Text style={styles.meta}>
          No challenges yet. You can challenge a player from the list.
        </Text>
      ) : (
        challenges.map((c) => {
          const incoming = c.toUid === user.uid;
          return (
            <View key={c.id} style={styles.row}>
              <Text style={styles.name}>{incoming ? 'Incoming challenge' : 'Sent challenge'}</Text>
              <Text style={styles.meta}>Best of {c.bestOf}</Text>
              {incoming ? (
                <View style={styles.actions}>
                  <Button label="Accept" onPress={() => void onAccept(c.id)} />
                  <Button
                    label="Decline"
                    variant="secondary"
                    onPress={() => void challengeService.setChallengeStatus(c.id, 'declined')}
                  />
                </View>
              ) : (
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => void challengeService.setChallengeStatus(c.id, 'cancelled')}
                />
              )}
            </View>
          );
        })
      )}

      <Text style={[typography.label, styles.section]}>Players</Text>
      {profiles.map((p) => (
        <Pressable
          key={p.uid}
          style={styles.row}
          onPress={() => router.push(`/(main)/city-player?uid=${p.uid}`)}
        >
          <Text style={styles.name}>{p.displayName}</Text>
          <Text style={styles.meta}>
            {p.winPct}% · {p.played} played · HB {p.highestBreak || '—'}
          </Text>
        </Pressable>
      ))}
      {cursor ? (
        <Button label="Load more" variant="secondary" onPress={() => void loadMore()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  best: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    gap: spacing.xs,
  },
  bestName: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.goldSoft,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  name: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  meta: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
