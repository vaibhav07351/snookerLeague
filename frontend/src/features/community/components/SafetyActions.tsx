import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import * as safety from '@/features/community/services/safety.service';
import { Button } from '@/shared/ui/Button';
import { toUserMessage } from '@/shared/errors/app-error';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';
import { usePalette } from '@/theme/ThemeProvider';
import { spacing, TOUCH_TARGET } from '@/theme/tokens';

/** Time for the sheet's slide-out before a confirm dialog can safely open (iOS drops it). */
const SHEET_CLOSE_MS = 400;

interface SafetyActionsProps {
  /** What is being reported. */
  targetKind: safety.ReportTarget;
  targetId: string;
  /** The person behind it; Block appears when given. */
  targetUid?: string | null;
  /** Name used in the confirmations. */
  name?: string;
  /** A small "..." button that opens the actions in a sheet, for dense cards and rows. */
  compact?: boolean;
}

/** Report (and optionally block) buttons for content made by someone else. */
export function SafetyActions({
  targetKind,
  targetId,
  targetUid,
  name = 'this person',
  compact = false,
}: SafetyActionsProps): ReactNode {
  const palette = usePalette();
  const [blocked, setBlocked] = useState(() => safety.isBlocked(targetUid));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void safety.blockedUids().then(() => setBlocked(safety.isBlocked(targetUid)));
    return safety.subscribeBlocks(() => setBlocked(safety.isBlocked(targetUid)));
  }, [targetUid]);

  async function onReport(): Promise<void> {
    const ok = await confirmAction(
      'Report this?',
      'Our team will review it. Use this for spam, abuse, fake results or anything that breaks the community rules.',
      'Report',
    );
    if (!ok) {
      return;
    }
    try {
      await safety.reportContent({ targetKind, targetId, targetUid, reason: 'inappropriate' });
      notify.success('Thanks for reporting', 'We will take a look.');
    } catch (error) {
      notify.error('Could not send the report', toUserMessage(error));
    }
  }

  async function onBlock(): Promise<void> {
    if (!targetUid) {
      return;
    }
    try {
      if (blocked) {
        await safety.unblockUser(targetUid);
        notify.info('Unblocked', `You will see ${name} again.`);
        return;
      }
      const ok = await confirmAction(
        `Block ${name}?`,
        'You will not see their posts or listings, and they cannot follow or challenge you.',
        'Block',
      );
      if (ok) {
        await safety.blockUser(targetUid);
        notify.info('Blocked', `You will not see ${name} any more.`);
      }
    } catch (error) {
      notify.error('Could not update the block', toUserMessage(error));
    }
  }

  if (compact) {
    const fromMenu = (action: () => Promise<void>) => () => {
      setMenuOpen(false);
      setTimeout(() => void action(), SHEET_CLOSE_MS);
    };
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More actions"
          hitSlop={4}
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={palette.textMuted} />
        </Pressable>
        <BottomSheet visible={menuOpen} title={name} onClose={() => setMenuOpen(false)}>
          <Button
            label="Report"
            icon="flag-outline"
            variant="secondary"
            onPress={fromMenu(onReport)}
          />
          {targetUid ? (
            <Button
              label={blocked ? 'Unblock' : 'Block'}
              icon={blocked ? 'person-outline' : 'remove-circle-outline'}
              variant="secondary"
              onPress={fromMenu(onBlock)}
            />
          ) : null}
        </BottomSheet>
      </>
    );
  }

  return (
    <View style={styles.row}>
      <Button
        label="Report"
        icon="flag-outline"
        variant="ghost"
        size="sm"
        onPress={() => void onReport()}
      />
      {targetUid ? (
        <Button
          label={blocked ? 'Unblock' : 'Block'}
          icon={blocked ? 'person-outline' : 'remove-circle-outline'}
          variant="ghost"
          size="sm"
          onPress={() => void onBlock()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -spacing.sm,
    marginRight: -spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
