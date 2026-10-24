import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/features/home/components/Button';
import type { BoardKey, NextTarget } from '@/features/stats/services/leaderboard.service';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, type Palette } from '@/theme/tokens';

/** Room the card needs; the list only shows it when this much space is free. */
export const NEXT_TARGET_HEIGHT = 112;

const TIPS: Record<BoardKey, string> = {
  rating: 'Wins against higher-rated players close the gap fastest.',
  wins: 'Every match win lifts your win rate.',
  race: 'A race win moves you most.',
  breaks: 'Score live, shot by shot, so your breaks are logged.',
};

interface NextTargetCardProps {
  target: NextTarget;
  boardKey: BoardKey;
  /** Opens Compare against the target player. */
  onCompare: (playerId: string) => void;
}

/** Who to catch next (or your lead, or what you need to get ranked). */
export function NextTargetCard({ target, boardKey, onCompare }: NextTargetCardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();

  let icon: ComponentProps<typeof Ionicons>['name'];
  let title: string;
  let body: string;
  if (target.kind === 'qualify') {
    icon = 'hourglass-outline';
    title = 'Get on the board';
    body = `Play ${target.needs} more ${target.needs === 1 ? 'result' : 'results'} to be ranked.`;
  } else if (target.kind === 'lead') {
    icon = 'trophy-outline';
    title = 'You are on top';
    body = `${target.gap} ${target.unit} clear of ${target.name}. Keep winning to stay there.`;
  } else {
    icon = 'flag-outline';
    title = `Next target: ${target.name}`;
    body =
      target.gap > 0
        ? `${target.gap} ${target.unit} ahead of you. ${TIPS[boardKey]}`
        : `Level with you. ${TIPS[boardKey]}`;
  }

  return (
    <View style={[styles.card, { height: NEXT_TARGET_HEIGHT - spacing.sm }]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={18} color={palette.primary} />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {target.kind !== 'qualify' ? (
          <Button
            label="Compare"
            size="sm"
            variant="ghost"
            onPress={() => onCompare(target.playerId)}
          />
        ) : null}
      </View>
      <Text style={styles.body} numberOfLines={3}>
        {body}
      </Text>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      marginTop: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.borderStrong,
      justifyContent: 'center',
      gap: 2,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: c.textMuted,
    },
  });
