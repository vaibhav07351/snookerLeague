import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { logger } from '@/shared/logging/logger';

/**
 * Physical feedback on the moments that matter while scoring. Always paired with a visual
 * change, never the only feedback: many people have vibration off and web has none.
 * Fire-and-forget; a failure is logged and never interrupts the action that caused it.
 */
/**
 * - tap: a value logged (a pot, an undo): the lightest tick
 * - light: the visit ends (miss, safety): the table passes over
 * - firm: a foul, a heavier moment than a pot
 * - success: a frame or match won
 */
export type HapticKind = 'tap' | 'light' | 'firm' | 'success';

function run(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'tap':
      return Haptics.selectionAsync();
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'firm':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') {
    return;
  }
  run(kind).catch((error: unknown) => {
    logger.warn('haptics', 'Haptic feedback failed', { kind, error: String(error) });
  });
}
