import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SnookerBall } from '@/features/match/components/SnookerBall';
import { useLayout } from '@/shared/hooks/use-layout';
import type { BallValue } from '@/shared/types/domain';
import { usePalette, useStyles } from '@/theme/ThemeProvider';
import { fonts, radii, spacing, TOUCH_TARGET, type Palette } from '@/theme/tokens';

const BALL_ORDER: BallValue[] = [1, 2, 3, 4, 5, 6, 7];
const FOUL_POINTS = [4, 5, 6, 7] as const;
/** Screen gutters (2 x 16) plus the cloth panel's own padding (2 x 8). */
const HORIZONTAL_CHROME = spacing.md * 2 + spacing.sm * 2;
const BALL_GAP = 2;
const MAX_BALL = 44;
const MIN_BALL = 30;

interface RaceBallPadProps {
  playerName: string | null;
  currentBreak: number;
  canUndo: boolean;
  onPot: (ball: BallValue) => void;
  onFoul: (points: number) => void;
  onMiss: () => void;
  onUndo: () => void;
}

export function RaceBallPad({
  playerName,
  currentBreak,
  canUndo,
  onPot,
  onFoul,
  onMiss,
  onUndo,
}: RaceBallPadProps): ReactNode {
  const styles = useStyles(makeStyles);
  const palette = usePalette();
  const { width } = useLayout();
  if (!playerName) {
    return null;
  }
  // Seven balls share one row; size them from the usable width so 320-wide phones fit.
  const cell = (width - HORIZONTAL_CHROME - BALL_GAP * (BALL_ORDER.length - 1)) / BALL_ORDER.length;
  const ballSize = Math.max(MIN_BALL, Math.min(MAX_BALL, Math.floor(cell) - 4));

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.atTable} numberOfLines={1}>
          <Text style={styles.atTableName}>{playerName}</Text> to play
        </Text>
        {currentBreak > 0 ? (
          <View style={styles.breakPill}>
            <Text style={styles.breakText}>Break {currentBreak}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>
        A miss or a foul passes the table. Tap a name to pick who scores.
      </Text>
      <View style={styles.cloth}>
        <View style={styles.balls}>
          {BALL_ORDER.map((value) => (
            <Pressable
              key={value}
              onPress={() => onPot(value)}
              style={({ pressed }) => [styles.ballHit, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Pot ${value} for ${playerName}`}
            >
              <SnookerBall value={value} size={ballSize} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={onMiss}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="swap-horizontal" size={16} color={palette.text} />
          <Text style={styles.actionText}>Miss</Text>
        </Pressable>
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          style={({ pressed }) => [
            styles.action,
            styles.actionMuted,
            pressed && styles.pressed,
            !canUndo && styles.disabled,
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-undo" size={16} color={palette.textMuted} />
          <Text style={[styles.actionText, styles.actionTextMuted]}>Undo</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {FOUL_POINTS.map((pts) => (
          <Pressable
            key={pts}
            onPress={() => onFoul(pts)}
            style={({ pressed }) => [styles.foul, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Foul ${pts} on ${playerName}`}
          >
            <Text style={styles.foulText} numberOfLines={1}>
              Foul {pts}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    atTable: {
      flexShrink: 1,
      minWidth: 0,
      fontFamily: fonts.bodyMedium,
      color: c.textMuted,
      fontSize: 14,
    },
    atTableName: {
      fontFamily: fonts.bodyBold,
      color: c.text,
    },
    breakPill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: radii.pill,
      backgroundColor: c.cardHighlight,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    breakText: {
      fontFamily: fonts.bodyBold,
      color: c.primary,
      fontSize: 12,
    },
    hint: {
      fontFamily: fonts.body,
      color: c.textFaint,
      fontSize: 12,
      lineHeight: 16,
    },
    cloth: {
      backgroundColor: c.table,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: c.tableEdge,
      paddingHorizontal: spacing.sm - 2,
      paddingVertical: spacing.xs,
    },
    balls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: BALL_GAP,
    },
    ballHit: {
      flex: 1,
      minWidth: 0,
      minHeight: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    action: {
      flex: 1,
      minHeight: TOUCH_TARGET,
      flexDirection: 'row',
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.sm,
      backgroundColor: c.cardRaised,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionMuted: {
      backgroundColor: 'transparent',
    },
    actionText: {
      fontFamily: fonts.bodyBold,
      color: c.text,
      fontSize: 14,
    },
    actionTextMuted: {
      color: c.textMuted,
    },
    pressed: {
      opacity: 0.75,
    },
    disabled: {
      opacity: 0.4,
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
  });
