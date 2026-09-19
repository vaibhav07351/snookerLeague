import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { formatDuration } from '@/shared/utils/datetime';
import { colors, fonts, spacing } from '@/theme/tokens';

interface MatchTimingHeaderProps {
  enabled: boolean;
  elapsedSeconds: number;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export function MatchTimingHeader({
  enabled,
  elapsedSeconds,
  disabled,
  onToggle,
}: MatchTimingHeaderProps): ReactNode {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{enabled ? formatDuration(elapsedSeconds) : 'Time'}</Text>
      <Switch
        value={enabled}
        disabled={disabled}
        onValueChange={onToggle}
        trackColor={{ false: colors.feltLight, true: colors.gold }}
        thumbColor={colors.chalk}
        style={styles.switch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: spacing.sm,
  },
  label: {
    fontFamily: fonts.bodyBold,
    color: colors.goldSoft,
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
  },
  switch: {
    transform: [{ scaleX: 0.88 }, { scaleY: 0.88 }],
  },
});
