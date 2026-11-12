import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Challenge, Match, PlayerProfile } from '@/shared/types/domain';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { SectionTitle } from '@/shared/ui/SectionTitle';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import {
  fonts,
  makeTypography,
  radii,
  spacing,
  TOUCH_TARGET,
  typeScale,
  type Palette,
} from '@/theme/tokens';

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

interface CommunityListHeaderProps {
  cityName: string;
  myUid: string;
  best: PlayerProfile | null;
  live: Match[];
  challenges: Challenge[];
  onAccept: (id: string) => void;
  onSetStatus: (id: string, status: 'declined' | 'cancelled') => void;
}

/**
 * Everything above the city's player list: directory chips, the best player, live matches
 * and challenges (each only when there is something to show).
 */
export function CommunityListHeader({
  cityName,
  myUid,
  best,
  live,
  challenges,
  onAccept,
  onSetStatus,
}: CommunityListHeaderProps): ReactNode {
  const styles = useStyles(makeStyles);
  const typography = useStyles(makeTypography);
  const palette = usePalette();
  return (
    <View>
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
            accessibilityLabel={`${d.label} in ${cityName}`}
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
          accessibilityLabel={`Best in ${cityName}: ${best.displayName}`}
          onPress={() => router.push(`/(main)/city-player?uid=${best.uid}`)}
          style={({ pressed }) => [styles.bestRow, pressed && styles.pressed]}
        >
          <Ionicons name="trophy" size={18} color={palette.primary} />
          <View style={styles.rowCopy}>
            <Text style={typography.label} numberOfLines={1}>
              Best in {cityName}
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
          <SectionTitle title={`Live in ${cityName}`} />
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
              const incoming = c.toUid === myUid;
              return (
                <Card key={c.id} tone={incoming ? 'highlight' : 'default'} style={styles.challenge}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.name}>{incoming ? 'Incoming' : 'Sent'}</Text>
                    <Text style={styles.meta}>Best of {c.bestOf}</Text>
                  </View>
                  {incoming ? (
                    <>
                      <Button label="Accept" size="sm" onPress={() => onAccept(c.id)} />
                      <Button
                        label="Decline"
                        size="sm"
                        variant="ghost"
                        onPress={() => onSetStatus(c.id, 'declined')}
                      />
                    </>
                  ) : (
                    <Button
                      label="Cancel"
                      size="sm"
                      variant="ghost"
                      onPress={() => onSetStatus(c.id, 'cancelled')}
                    />
                  )}
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionTitle title="Players" />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    dirScroll: {
      flexGrow: 0,
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
      fontSize: typeScale.body,
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
      fontSize: typeScale.lead,
    },
    meta: {
      fontFamily: fonts.body,
      color: c.textMuted,
      fontSize: typeScale.small,
      lineHeight: 18,
    },
  });
