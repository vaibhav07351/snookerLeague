import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SafetyActions } from '@/features/community/components/SafetyActions';
import {
  closeLookingPost,
  LOOKING_KIND_LABEL,
} from '@/features/community/services/looking.service';
import { toUserMessage } from '@/shared/errors/app-error';
import type { LookingPost } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { notify } from '@/shared/ui/notify';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, typeScale, type Palette } from '@/theme/tokens';

/** One "Looking" post: kind, title, details, author; "..." to report, or close my own. */
export function LookingPostCard({
  post: p,
  myUid,
}: {
  post: LookingPost;
  myUid: string;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const mine = p.createdByUid === myUid;
  const closed = p.status === 'closed';
  return (
    <Card style={closed ? styles.closedCard : undefined}>
      <View style={styles.cardHead}>
        <Text style={styles.kind} numberOfLines={1}>
          {LOOKING_KIND_LABEL[p.kind]}
        </Text>
        {closed ? <Text style={styles.stamp}>CLOSED</Text> : null}
        {!mine ? (
          <SafetyActions
            compact
            targetKind="looking"
            targetId={p.id}
            targetUid={p.createdByUid}
            name={p.authorName}
          />
        ) : null}
      </View>
      <Text style={styles.title}>{p.title}</Text>
      {p.body ? (
        <Text style={styles.body} numberOfLines={3}>
          {p.body}
        </Text>
      ) : null}
      <View style={styles.footRow}>
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
            variant="ghost"
            onPress={() => {
              void closeLookingPost(p.id).catch((error: unknown) => {
                notify.error('Could not close', toUserMessage(error));
              });
            }}
          />
        ) : null}
      </View>
    </Card>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    closedCard: {
      opacity: 0.75,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    kind: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: typeScale.label,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    stamp: {
      fontFamily: fonts.bodyBold,
      color: c.textMuted,
      fontSize: typeScale.label,
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
      fontSize: typeScale.lead,
      lineHeight: 22,
    },
    body: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.body,
      lineHeight: 20,
    },
    footRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: 4,
      minHeight: 32,
    },
    author: {
      flexShrink: 1,
      fontFamily: fonts.bodyMedium,
      color: c.info,
      fontSize: typeScale.small,
    },
  });
