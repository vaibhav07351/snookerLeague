import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SnookerBall } from '@/features/match/components/SnookerBall';
import type { BallValue, OpenFrame } from '@/shared/types/domain';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const BALL_ORDER: BallValue[] = [1, 2, 3, 4, 5, 6, 7];

interface LiveScoreboardProps {
  openFrame: OpenFrame;
  teamALabel: string;
  teamBLabel: string;
  canScore: boolean;
  onPot: (ball: BallValue) => void;
  onFoul: (points: number) => void;
  onEndVisit: (kind: 'miss' | 'safety') => void;
  onFreeBall: () => void;
  onUndo: () => void;
  onFrameWon: (winner: 'a' | 'b') => void;
  canUndo: boolean;
}

export function LiveScoreboard({
  openFrame,
  teamALabel,
  teamBLabel,
  canScore,
  onPot,
  onFoul,
  onEndVisit,
  onFreeBall,
  onUndo,
  onFrameWon,
  canUndo,
}: LiveScoreboardProps): ReactNode {
  return (
    <View style={styles.wrap}>
      {!canScore ? (
        <Text style={styles.watch}>Watching live — scores update as shots are recorded.</Text>
      ) : (
        <>
          <View style={styles.balls}>
            {BALL_ORDER.map((value) => (
              <Pressable
                key={value}
                onPress={() => onPot(value)}
                style={styles.ballHit}
                accessibilityRole="button"
              >
                <SnookerBall value={value} size={40} />
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Action label="Miss" onPress={() => onEndVisit('miss')} />
            <Action label="Safety" onPress={() => onEndVisit('safety')} />
            <Action label="Free" onPress={onFreeBall} />
            <Action label="Undo" onPress={onUndo} disabled={!canUndo} muted />
          </View>
          <View style={styles.row}>
            {[4, 5, 6, 7].map((pts) => (
              <Pressable key={pts} onPress={() => onFoul(pts)} style={styles.foul}>
                <Text style={styles.foulText}>Foul {pts}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <Pressable onPress={() => onFrameWon('a')} style={styles.win}>
              <Text style={styles.winText} numberOfLines={2}>
                {teamALabel} wins
              </Text>
            </Pressable>
            <Pressable onPress={() => onFrameWon('b')} style={[styles.win, styles.winB]}>
              <Text style={styles.winTextB} numberOfLines={2}>
                {teamBLabel} wins
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Action({
  label,
  onPress,
  disabled,
  muted,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  muted?: boolean;
}): ReactNode {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.action, muted && styles.actionMuted, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    marginBottom: spacing.sm,
  },
  watch: {
    fontFamily: fonts.body,
    color: colors.mint,
    fontSize: 13,
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
  win: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  winB: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.mint,
  },
  winText: {
    fontFamily: fonts.bodyBold,
    color: colors.felt,
    fontSize: 13,
    textAlign: 'center',
  },
  winTextB: {
    fontFamily: fonts.bodyBold,
    color: colors.chalk,
    fontSize: 13,
    textAlign: 'center',
  },
});
