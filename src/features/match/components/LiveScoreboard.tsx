import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SnookerBall } from '@/features/match/components/SnookerBall';
import { describeBallOn, isBallOn, type TableState } from '@/features/match/services/table-state';
import { useLayout } from '@/shared/hooks/use-layout';
import type { BallValue } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

const BALL_ORDER: BallValue[] = [1, 2, 3, 4, 5, 6, 7];
const FOUL_VALUES = [4, 5, 6, 7] as const;

type IconName = ComponentProps<typeof Ionicons>['name'];

interface LiveScoreboardProps {
  table: TableState;
  /** Points behind the side at the table (0 when level or ahead). */
  deficit: number;
  teamALabel: string;
  teamBLabel: string;
  canUndo: boolean;
  onPot: (ball: BallValue) => void;
  onFoul: (points: number) => void;
  onEndVisit: (kind: 'miss' | 'safety') => void;
  onFreeBall: () => void;
  onUndo: () => void;
  onFrameWon: (winner: 'a' | 'b') => void;
}

/** Ball pad for the scorer. Balls that are "on" are raised; the rest stay tappable but dimmed. */
export function LiveScoreboard({
  table,
  deficit,
  teamALabel,
  teamBLabel,
  canUndo,
  onPot,
  onFoul,
  onEndVisit,
  onFreeBall,
  onUndo,
  onFrameWon,
}: LiveScoreboardProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { width } = useLayout();
  // 7 balls across the pad: cloth padding (2 x 8) + gaps (6 x 4) inside the screen gutters (2 x 16).
  const ballSize = Math.max(30, Math.min(46, Math.floor((width - 32 - 16 - 24) / 7) - 6));
  const snookersNeeded = deficit > table.pointsRemaining;

  return (
    <View style={styles.wrap}>
      <View style={styles.statusRow}>
        <Text style={styles.onText} numberOfLines={1}>
          {describeBallOn(table)}
        </Text>
        <Text
          style={[styles.remaining, snookersNeeded && { color: palette.warning }]}
          numberOfLines={1}
        >
          {table.pointsRemaining} left on the table
          {snookersNeeded ? ` · snookers needed (${deficit} behind)` : ''}
        </Text>
      </View>

      <View style={styles.cloth}>
        {BALL_ORDER.map((value) => {
          const on = isBallOn(table, value);
          return (
            <Pressable
              key={value}
              onPress={() => onPot(value)}
              accessibilityRole="button"
              accessibilityLabel={`Pot ${BALL_LABEL[value]}${on ? ', ball on' : ''}`}
              style={({ pressed }) => [
                styles.ballHit,
                !on && styles.ballOff,
                pressed && styles.ballPressed,
              ]}
            >
              <View style={[styles.ring, on && styles.ringOn]}>
                <SnookerBall value={value} size={ballSize} />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.row}>
        <Action icon="close-circle-outline" label="Miss" onPress={() => onEndVisit('miss')} />
        <Action icon="shield-outline" label="Safety" onPress={() => onEndVisit('safety')} />
        <Action icon="sparkles-outline" label="Free ball" onPress={onFreeBall} />
        <Action icon="arrow-undo-outline" label="Undo" onPress={onUndo} disabled={!canUndo} />
      </View>

      <View style={styles.row}>
        {FOUL_VALUES.map((pts) => (
          <Pressable
            key={pts}
            onPress={() => onFoul(pts)}
            accessibilityRole="button"
            accessibilityLabel={`Foul, ${pts} points to the opponent`}
            style={({ pressed }) => [styles.foul, pressed && styles.pressed]}
          >
            <Text style={styles.foulText}>Foul {pts}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <FrameButton side="a" label={teamALabel} onPress={() => onFrameWon('a')} />
        <FrameButton side="b" label={teamBLabel} onPress={() => onFrameWon('b')} />
      </View>
    </View>
  );
}

const BALL_LABEL: Record<BallValue, string> = {
  1: 'red',
  2: 'yellow',
  3: 'green',
  4: 'brown',
  5: 'blue',
  6: 'pink',
  7: 'black',
};

function Action({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Ionicons name={icon} size={18} color={palette.text} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FrameButton({
  side,
  label,
  onPress,
}: {
  side: 'a' | 'b';
  label: string;
  onPress: () => void;
}): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const tone = side === 'a' ? palette.teamA : palette.teamB;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`End frame, ${label} wins it`}
      style={({ pressed }) => [styles.win, { borderColor: tone }, pressed && styles.pressed]}
    >
      <Text style={styles.winKicker}>Frame to</Text>
      <Text style={[styles.winText, { color: tone }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    onText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    remaining: {
      fontFamily: fonts.body,
      fontSize: 12,
      flexShrink: 1,
      textAlign: 'right',
      color: c.textMuted,
    },
    cloth: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: radii.md,
      backgroundColor: c.table,
      borderWidth: 3,
      borderColor: c.tableEdge,
    },
    ballHit: {
      minHeight: TOUCH_TARGET + 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ballOff: {
      opacity: 0.85,
    },
    ballPressed: {
      transform: [{ scale: 0.9 }],
    },
    ring: {
      padding: 2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    ringOn: {
      borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    row: {
      flexDirection: 'row',
      gap: 6,
    },
    action: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET + 4,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      borderRadius: radii.sm,
      backgroundColor: c.cardRaised,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 2,
    },
    actionText: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 12,
    },
    pressed: {
      opacity: 0.75,
    },
    disabled: {
      opacity: 0.35,
    },
    foul: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET,
      borderRadius: radii.sm,
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 2,
    },
    foulText: {
      fontFamily: fonts.bodyBold,
      color: c.danger,
      fontSize: 13,
    },
    win: {
      flex: 1,
      minWidth: 0,
      minHeight: 52,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    winKicker: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      color: c.textMuted,
    },
    winText: {
      fontFamily: fonts.bodyBold,
      fontSize: 15,
    },
  });
