import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SnookerBall } from '@/features/match/components/SnookerBall';
import type { BallValue } from '@/shared/types/domain';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const BALL_ORDER: BallValue[] = [1, 2, 3, 4, 5, 6, 7];

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
  if (!playerName) {
    return null;
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.atTable} numberOfLines={1}>
        {playerName} to play
        {currentBreak > 0 ? ` · Break ${currentBreak}` : ''}
      </Text>
      <Text style={styles.hint}>
        Miss or a foul passes the table. Tap a name to pick who scores.
      </Text>
      <View style={styles.balls}>
        {BALL_ORDER.map((value) => (
          <Pressable
            key={value}
            onPress={() => onPot(value)}
            style={styles.ballHit}
            accessibilityRole="button"
            accessibilityLabel={`Pot ${value} for ${playerName}`}
          >
            <SnookerBall value={value} size={40} />
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={onMiss} style={styles.action} accessibilityRole="button">
          <Text style={styles.actionText}>Miss</Text>
        </Pressable>
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          style={[styles.action, styles.actionMuted, !canUndo && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>Undo</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {[4, 5, 6, 7].map((pts) => (
          <Pressable
            key={pts}
            onPress={() => onFoul(pts)}
            style={styles.foul}
            accessibilityRole="button"
            accessibilityLabel={`Foul ${pts} on ${playerName}`}
          >
            <Text style={styles.foulText}>Foul {pts}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  atTable: {
    fontFamily: fonts.bodyMedium,
    color: colors.goldSoft,
    fontSize: 13,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.chalkMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  balls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ballHit: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  action: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionMuted: {
    backgroundColor: 'transparent',
  },
  actionText: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.4,
  },
  foul: {
    flex: 1,
    minHeight: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  foulText: {
    fontFamily: fonts.bodyBold,
    color: colors.coral,
    fontSize: 12,
  },
});
