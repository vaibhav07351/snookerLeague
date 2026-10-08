import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { Card } from '@/shared/ui/Card';
import { Chip } from '@/shared/ui/Chip';
import { EmptyState } from '@/shared/ui/EmptyState';
import { notify } from '@/shared/ui/notify';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, makeTypography, radii, spacing, type Palette } from '@/theme/tokens';

const KINDS: Array<LookingKind | 'all'> = ['all', 'opponent', 'player', 'club', 'table'];

export default function LookingScreen(): ReactNode {
  const { user } = useSession();
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
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
      notify.error('Could not post', toUserMessage(error));
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
        <Text style={[typography.subtitle, styles.lead]}>
          Find opponents, players, clubs and tables near you.
        </Text>
        <EmptyState
          icon="location-outline"
          title="Pick your city first"
          message="Looking posts are shared with players in the same city."
          actionLabel="Choose city"
          onAction={() => router.push('/location')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={typography.label}>Looking in</Text>
      <Text style={typography.title} numberOfLines={2}>
        {user.cityName}
      </Text>
      <Text style={[typography.subtitle, styles.lead]}>
        Post what you need. Closed posts stay visible with a stamp.
      </Text>

      <Button
        label={compose ? 'Cancel post' : 'New Looking post'}
        icon={compose ? 'close' : 'add'}
        variant={compose ? 'secondary' : 'primary'}
        onPress={() => setCompose((v) => !v)}
      />

      {compose ? (
        <Card tone="raised" style={styles.compose}>
          <Text style={typography.label}>What are you looking for?</Text>
          <View style={styles.chipRow}>
            {(Object.keys(LOOKING_KIND_LABEL) as LookingKind[]).map((k) => (
              <Chip
                key={k}
                label={LOOKING_KIND_LABEL[k]}
                selected={draftKind === k}
                onPress={() => setDraftKind(k)}
              />
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
            placeholder="Best of 5, around 7pm..."
          />
          <Button label="Post" onPress={() => void publish()} loading={busy} disabled={busy} />
        </Card>
      ) : null}

      <SectionTitle title="Posts" />
      <View style={styles.chipRow}>
        {KINDS.map((k) => (
          <Chip
            key={k}
            label={k === 'all' ? 'All' : LOOKING_KIND_LABEL[k]}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        ))}
      </View>
      <View style={styles.closedRow}>
        <Chip
          label={includeClosed ? 'Showing closed' : 'Open only'}
          selected={includeClosed}
          onPress={() => setIncludeClosed((v) => !v)}
        />
      </View>

      {posts.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No Looking posts in this city yet"
          message="Be the first: tell local players what you need."
          actionLabel={compose ? undefined : 'New Looking post'}
          onAction={compose ? undefined : () => setCompose(true)}
        />
      ) : (
        <View style={styles.list}>
          {posts.map((p) => {
            const mine = p.createdByUid === user.uid;
            const closed = p.status === 'closed';
            return (
              <Card key={p.id} style={closed ? styles.closedCard : undefined}>
                <View style={styles.cardHead}>
                  <Text style={styles.kind} numberOfLines={1}>
                    {LOOKING_KIND_LABEL[p.kind]}
                  </Text>
                  {closed ? <Text style={styles.stamp}>CLOSED</Text> : null}
                </View>
                <Text style={styles.title}>{p.title}</Text>
                {p.body ? <Text style={styles.body}>{p.body}</Text> : null}
                <Pressable
                  accessibilityRole="link"
                  hitSlop={8}
                  style={styles.authorRow}
                  onPress={() => router.push(`/(main)/city-player?uid=${p.createdByUid}`)}
                >
                  <Ionicons name="person-circle-outline" size={18} color={palette.info} />
                  <Text style={styles.author} numberOfLines={1}>
                    {p.authorName}
                  </Text>
                </Pressable>
                {mine && p.status === 'open' ? (
                  <Button
                    label="Mark closed"
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      void closeLookingPost(p.id).catch((error: unknown) => {
                        notify.error('Could not close', toUserMessage(error));
                      });
                    }}
                  />
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    lead: {
      marginTop: spacing.xs,
      marginBottom: spacing.md,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    closedRow: {
      flexDirection: 'row',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    compose: {
      marginTop: spacing.md,
      gap: spacing.md,
    },
    list: {
      gap: spacing.sm,
    },
    closedCard: {
      opacity: 0.75,
    },
    cardHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    kind: {
      flexShrink: 1,
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    stamp: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: 11,
      letterSpacing: 1.2,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    title: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 16,
      lineHeight: 22,
    },
    body: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      minHeight: 32,
      maxWidth: '100%',
    },
    author: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      color: c.info,
      fontSize: 13,
    },
  });
