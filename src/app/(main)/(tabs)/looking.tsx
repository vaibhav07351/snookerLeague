import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/features/auth/hooks/use-session';
import {
  LOOKING_KIND_LABEL,
  closeLookingPost,
  createLookingPost,
  listLookingPosts,
} from '@/features/community/services/looking.service';
import { Button } from '@/features/home/components/Button';
import { Screen } from '@/features/home/components/Screen';
import { TextField } from '@/features/home/components/TextField';
import { toUserMessage } from '@/shared/errors/app-error';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { LookingKind, LookingPost } from '@/shared/types/domain';
import { colors, fonts, radii, spacing, typography } from '@/theme/tokens';

const KINDS: Array<LookingKind | 'all'> = ['all', 'opponent', 'player', 'club', 'table'];

export default function LookingScreen(): ReactNode {
  const { user } = useSession();
  const [posts, setPosts] = useState<LookingPost[]>([]);
  const [kind, setKind] = useState<LookingKind | 'all'>('all');
  const [includeClosed, setIncludeClosed] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draftKind, setDraftKind] = useState<LookingKind>('opponent');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const cityId = user?.cityId ?? null;

  const reload = useCallback(async () => {
    if (!cityId) {
      setPosts([]);
      return;
    }
    setPosts(await listLookingPosts({ cityId, kind, includeClosed }));
  }, [cityId, kind, includeClosed]);

  useStoreReload(reload, cityId ? `looking:${cityId}:${kind}:${includeClosed}` : null);

  async function publish(): Promise<void> {
    if (!user?.cityId || !user.cityName) {
      return;
    }
    setBusy(true);
    try {
      await createLookingPost({
        cityId: user.cityId,
        cityName: user.cityName,
        kind: draftKind,
        title,
        body,
      });
      setTitle('');
      setBody('');
      setCompose(false);
    } catch (error) {
      Alert.alert('Could not post', toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return null;
  }

  if (!cityId) {
    return (
      <Screen>
        <Text style={typography.title}>Looking</Text>
        <Text style={typography.subtitle}>
          Pick your city to find opponents, clubs, and tables.
        </Text>
        <Button label="Choose city" onPress={() => router.push('/location')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label}>Looking in</Text>
      <Text style={typography.title}>{user.cityName}</Text>
      <Text style={styles.lead}>Post what you need. Closed posts stay visible with a stamp.</Text>

      <View style={styles.chipRow}>
        {KINDS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={[styles.chip, kind === k && styles.chipOn]}
          >
            <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>
              {k === 'all' ? 'All' : LOOKING_KIND_LABEL[k]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setIncludeClosed((v) => !v)} style={styles.toggle}>
        <Text style={styles.toggleText}>{includeClosed ? 'Showing closed' : 'Open only'}</Text>
      </Pressable>

      <Button
        label={compose ? 'Cancel post' : 'New Looking post'}
        variant={compose ? 'secondary' : 'primary'}
        onPress={() => setCompose((v) => !v)}
      />

      {compose ? (
        <View style={styles.compose}>
          <View style={styles.chipRow}>
            {(Object.keys(LOOKING_KIND_LABEL) as LookingKind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setDraftKind(k)}
                style={[styles.chip, draftKind === k && styles.chipOn]}
              >
                <Text style={[styles.chipText, draftKind === k && styles.chipTextOn]}>
                  {LOOKING_KIND_LABEL[k]}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Friday frames?"
          />
          <TextField
            label="Details"
            value={body}
            onChangeText={setBody}
            placeholder="Best of 5, around 7pm…"
          />
          <Button label="Post" onPress={() => void publish()} loading={busy} disabled={busy} />
        </View>
      ) : null}

      {posts.length === 0 ? (
        <Text style={styles.empty}>No Looking posts in this city yet.</Text>
      ) : (
        posts.map((p) => {
          const mine = p.createdByUid === user.uid;
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.kind}>{LOOKING_KIND_LABEL[p.kind]}</Text>
                {p.status === 'closed' ? <Text style={styles.stamp}>CLOSED</Text> : null}
              </View>
              <Text style={styles.title}>{p.title}</Text>
              {p.body ? <Text style={styles.body}>{p.body}</Text> : null}
              <Pressable onPress={() => router.push(`/(main)/city-player?uid=${p.createdByUid}`)}>
                <Text style={styles.author}>{p.authorName}</Text>
              </Pressable>
              {mine && p.status === 'open' ? (
                <Button
                  label="Mark closed"
                  variant="secondary"
                  onPress={() => {
                    void closeLookingPost(p.id).catch((error: unknown) => {
                      Alert.alert('Could not close', toUserMessage(error));
                    });
                  }}
                />
              ) : null}
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: colors.surfaceBright,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    color: colors.chalk,
    fontSize: 12,
  },
  chipTextOn: {
    color: colors.goldSoft,
    fontFamily: fonts.bodyBold,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  toggleText: {
    fontFamily: fonts.bodyBold,
    color: colors.mint,
    fontSize: 13,
  },
  compose: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    marginTop: spacing.lg,
  },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kind: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stamp: {
    fontFamily: fonts.bodyBold,
    color: colors.coral,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 16,
  },
  body: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 14,
  },
  author: {
    fontFamily: fonts.bodyMedium,
    color: colors.sky,
    fontSize: 13,
  },
});
