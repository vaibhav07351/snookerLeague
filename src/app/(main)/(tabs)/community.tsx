import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

export default function CommunityScreen(): ReactNode {
  const { user } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [best, setBest] = useState<PlayerProfile | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [live, setLive] = useState<Match[]>([]);
  const [cursor, setCursor] = useState<{ rankScore: number; uid: string } | null>(null);

  const cityId = user?.cityId ?? null;

  const uid = user?.uid ?? null;

  // Local data (challenges, live hub matches): re-read whenever the store changes.
  const reloadLocal = useCallback(async () => {
    if (!uid) {
      return;
    }
    const inbox = await challengeService.listMyChallenges({ refresh: false });
    setChallenges(inbox.filter((c) => c.status === 'pending'));
    const hub = cityId ? await cityHubService.getCityHubForUser(uid) : null;
    if (hub) {
      const matches = await matchService.listMatches(hub.id, { limit: 20 });
      setLive(matches.filter((m) => m.outcome.status === 'in_progress'));
    } else {
      setLive([]);
    }
  }, [cityId, uid]);

  useStoreReload(reloadLocal, cityId ? `community:${cityId}:${uid ?? ''}` : uid);

  // Cloud data (city players page 1, challenge inbox): fetch when the screen opens or the
  // city changes, not on every store change, so "Load more" pages are never reset.
  useEffect(() => {
    if (!uid) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const inbox = await challengeService.listMyChallenges();
        if (!cancelled) {
          setChallenges(inbox.filter((c) => c.status === 'pending'));
        }
        if (!cityId) {
          if (!cancelled) {
            setProfiles([]);
            setBest(null);
          }
          return;
        }
        const page = await profileService.listCityProfiles({ cityId });
        if (!cancelled) {
          setProfiles(page.items);
          setCursor(page.nextCursor);
          setBest(profileService.bestInCity(page.items));
        }
      } catch (error) {
        if (!cancelled) {
          notify.error('Could not load your city', toUserMessage(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId, uid]);

  async function loadMore(): Promise<void> {
    if (!cityId || !cursor) {
      return;
    }
    const page = await profileService.listCityProfiles({
      cityId,
      cursorRank: cursor.rankScore,
      cursorUid: cursor.uid,
    });
    setProfiles((prev) => {
      const seen = new Set(prev.map((p) => p.uid));
      return [...prev, ...page.items.filter((p) => !seen.has(p.uid))];
    });
    setCursor(page.nextCursor);
  }

  async function setStatus(id: string, status: 'declined' | 'cancelled'): Promise<void> {
    try {
      await challengeService.setChallengeStatus(id, status);
    } catch (error) {
      notify.error('Could not update the challenge', toUserMessage(error));
    }
  }

  async function onAccept(id: string): Promise<void> {
    try {
      const { match } = await challengeService.acceptChallenge(id);
      router.push(`/match/${match.id}`);
    } catch (error) {
      notify.error('Could not accept', toUserMessage(error));
    }
  }

  if (!user) {
    return null;
  }

  if (user.isDemo && !cityId) {
    return (
      <Screen>
        <Text style={typography.title}>Community</Text>
        <Text style={[typography.subtitle, styles.lead]}>
          Players in your city, live matches and challenges.
        </Text>
        <EmptyState
          icon="people-outline"
          title="Sign in to join the community"
          message="Sign in with Google to see players in your city, live matches, and challenges."
        />
      </Screen>
    );
  }

  if (!cityId) {
    return (
      <Screen>
        <Text style={typography.title}>Community</Text>
        <Text style={[typography.subtitle, styles.lead]}>
          Players in your city, live matches and challenges.
        </Text>
        <EmptyState
          icon="location-outline"
          title="Pick your city"
          message="Choose your city to see local players."
          actionLabel="Choose city"
          onAction={() => router.push('/location')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label}>Snooker community in</Text>
      <Text style={typography.title} numberOfLines={2}>
        {user.cityName}
      </Text>

      <CommunityHubTiles
        tiles={[
          {
            label: 'Looking',
            hint: 'Opponent · table · club',
            icon: 'search-outline',
            onPress: () => router.push('/(main)/looking'),
          },
          {
            label: 'Clubs',
            hint: 'Local clubs',
            icon: 'business-outline',
            onPress: () => router.push('/(main)/directory?kind=club'),
          },
          {
            label: 'Tables',
            hint: 'Venues & tables',
            icon: 'grid-outline',
            onPress: () => router.push('/(main)/directory?kind=table'),
          },
          {
            label: 'Referees',
            hint: 'Officials',
            icon: 'flag-outline',
            onPress: () => router.push('/(main)/directory?kind=referee'),
          },
          {
            label: 'Organisers',
            hint: 'Events & leagues',
            icon: 'calendar-outline',
            onPress: () => router.push('/(main)/directory?kind=organiser'),
          },
        ]}
      />

      {best ? (
        <Card
          tone="highlight"
          accessibilityLabel={`Best in ${user.cityName}: ${best.displayName}`}
          onPress={() => router.push(`/(main)/city-player?uid=${best.uid}`)}
        >
          <View style={styles.bestHead}>
            <Ionicons name="trophy" size={16} color={palette.primary} />
            <Text style={[typography.label, styles.shrink]} numberOfLines={1}>
              Best in {user.cityName}
            </Text>
          </View>
          <Text style={styles.bestName} numberOfLines={2}>
            {best.displayName}
          </Text>
          <Text style={styles.meta}>
            {best.winPct}% · {best.played} games · HB {best.highestBreak || '-'}
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={styles.meta}>Play 3 city matches to crown a best player.</Text>
        </Card>
      )}

      <SectionTitle title={`Live in ${user.cityName}`} />
      {live.length === 0 ? (
        <Text style={styles.meta}>No live matches right now.</Text>
      ) : (
        <View style={styles.list}>
          {live.map((m, index) => {
            const open = m.openFrame;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.row,
                  index === live.length - 1 && styles.rowLast,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push(`/match/${m.id}`)}
              >
                <View style={styles.liveDot} />
                <View style={styles.rowCopy}>
                  <Text style={styles.name} numberOfLines={1}>
                    {m.namedLabel ?? `Best of ${m.bestOf}`}
                  </Text>
                  <Text style={styles.meta}>
                    Frames {m.outcome.framesA}-{m.outcome.framesB}
                    {open ? ` · ${open.teamAPoints}-${open.teamBPoints}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
              </Pressable>
            );
          })}
        </View>
      )}

      <SectionTitle title="Challenges" />
      {challenges.length === 0 ? (
        <Text style={styles.meta}>
          No challenges yet. You can challenge a player from the list.
        </Text>
      ) : (
        <View style={styles.stack}>
          {challenges.map((c) => {
            const incoming = c.toUid === user.uid;
            return (
              <Card key={c.id} tone={incoming ? 'highlight' : 'default'}>
                <Text style={styles.name}>
                  {incoming ? 'Incoming challenge' : 'Sent challenge'}
                </Text>
                <Text style={styles.meta}>Best of {c.bestOf}</Text>
                {incoming ? (
                  <View style={styles.actions}>
                    <Button
                      label="Accept"
                      size="sm"
                      onPress={() => void onAccept(c.id)}
                      style={styles.actionBtn}
                    />
                    <Button
                      label="Decline"
                      size="sm"
                      variant="secondary"
                      onPress={() => void setStatus(c.id, 'declined')}
                      style={styles.actionBtn}
                    />
                  </View>
                ) : (
                  <Button
                    label="Cancel"
                    size="sm"
                    variant="secondary"
                    onPress={() => void setStatus(c.id, 'cancelled')}
                  />
                )}
              </Card>
            );
          })}
        </View>
      )}

      <SectionTitle title="Players" />
      {profiles.length === 0 ? (
        <Text style={styles.meta}>No players in this city yet.</Text>
      ) : (
        <View style={styles.list}>
          {profiles.map((p, index) => (
            <Pressable
              key={p.uid}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                index === profiles.length - 1 && styles.rowLast,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(`/(main)/city-player?uid=${p.uid}`)}
            >
              <View style={styles.rowCopy}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.displayName}
                </Text>
                <Text style={styles.meta}>
                  {p.winPct}% · {p.played} played · HB {p.highestBreak || '-'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
            </Pressable>
          ))}
        </View>
      )}
      {cursor ? (
        <Button
          label="Load more"
          variant="secondary"
          onPress={() => void loadMore()}
          style={styles.loadMore}
        />
      ) : null}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    lead: {
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    shrink: {
      flexShrink: 1,
    },
    bestHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    bestName: {
      fontFamily: fonts.display,
      fontSize: 22,
      lineHeight: 28,
      color: c.text,
    },
    list: {
      backgroundColor: c.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    stack: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: TOUCH_TARGET,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    pressed: {
      backgroundColor: c.cardRaised,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.live,
    },
    name: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    actionBtn: {
      flexGrow: 1,
      flexBasis: 120,
    },
    loadMore: {
      marginTop: spacing.md,
    },
  });
