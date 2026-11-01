import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import * as challengeService from '@/features/community/services/challenge.service';
import * as profileService from '@/features/community/services/profile.service';
import { Button } from '@/shared/ui/Button';
import { Screen } from '@/shared/ui/Screen';
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

const DIRECTORY: ReadonlyArray<{
  kind: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}> = [
  { kind: 'club', label: 'Clubs', icon: 'business-outline' },
  { kind: 'table', label: 'Tables', icon: 'grid-outline' },
  { kind: 'referee', label: 'Referees', icon: 'flag-outline' },
  { kind: 'organiser', label: 'Organisers', icon: 'calendar-outline' },
];

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
      <View style={styles.cityRow}>
        <Ionicons name="location" size={18} color={palette.primary} />
        <Text style={styles.city} numberOfLines={1}>
          {user.cityName}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dirRow}
        style={styles.dirScroll}
      >
        {DIRECTORY.map((d) => (
          <Pressable
            key={d.kind}
            accessibilityRole="button"
            accessibilityLabel={`${d.label} in ${user.cityName}`}
            onPress={() => router.push(`/(main)/directory?kind=${d.kind}`)}
            style={({ pressed }) => [styles.dirChip, pressed && styles.pressed]}
          >
            <Ionicons name={d.icon} size={16} color={palette.primary} />
            <Text style={styles.dirText}>{d.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {best ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Best in ${user.cityName}: ${best.displayName}`}
          onPress={() => router.push(`/(main)/city-player?uid=${best.uid}`)}
          style={({ pressed }) => [styles.bestRow, pressed && styles.pressed]}
        >
          <Ionicons name="trophy" size={18} color={palette.primary} />
          <View style={styles.rowCopy}>
            <Text style={typography.label} numberOfLines={1}>
              Best in {user.cityName}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {best.displayName}
              <Text style={styles.meta}>
                {'  '}
                {best.winPct}% · HB {best.highestBreak || '-'}
              </Text>
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
        </Pressable>
      ) : null}

      {live.length > 0 ? (
        <>
          <SectionTitle title={`Live in ${user.cityName}`} />
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
        </>
      ) : null}

      {challenges.length > 0 ? (
        <>
          <SectionTitle title="Challenges" />
          <View style={styles.stack}>
            {challenges.map((c) => {
              const incoming = c.toUid === user.uid;
              return (
                <Card key={c.id} tone={incoming ? 'highlight' : 'default'} style={styles.challenge}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.name}>{incoming ? 'Incoming' : 'Sent'}</Text>
                    <Text style={styles.meta}>Best of {c.bestOf}</Text>
                  </View>
                  {incoming ? (
                    <>
                      <Button label="Accept" size="sm" onPress={() => void onAccept(c.id)} />
                      <Button
                        label="Decline"
                        size="sm"
                        variant="ghost"
                        onPress={() => void setStatus(c.id, 'declined')}
                      />
                    </>
                  ) : (
                    <Button
                      label="Cancel"
                      size="sm"
                      variant="ghost"
                      onPress={() => void setStatus(c.id, 'cancelled')}
                    />
                  )}
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionTitle title="Players" />
      {profiles.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No players here yet"
          message="Play a match in your city hub to put yourself on the map."
        />
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
    cityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    city: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.display,
      fontSize: 24,
      lineHeight: 30,
      color: c.text,
    },
    dirScroll: {
      flexGrow: 0,
      marginTop: spacing.md,
      marginHorizontal: -spacing.md,
    },
    dirRow: {
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    dirChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    dirText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: c.text,
    },
    bestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.cardHighlight,
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
    challenge: {
      flexDirection: 'row',
      alignItems: 'center',
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
    loadMore: {
      marginTop: spacing.md,
    },
  });
