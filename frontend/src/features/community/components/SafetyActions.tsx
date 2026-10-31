import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import * as safety from '@/features/community/services/safety.service';
import { Button } from '@/features/home/components/Button';
import { toUserMessage } from '@/shared/errors/app-error';
import { notify } from '@/shared/ui/notify';
import { confirmAction } from '@/shared/utils/confirm';
import { spacing } from '@/theme/tokens';

interface SafetyActionsProps {
  /** What is being reported. */
  targetKind: safety.ReportTarget;
  targetId: string;
  /** The person behind it; Block appears when given. */
  targetUid?: string | null;
  /** Name used in the confirmations. */
  name?: string;
}

/** Report (and optionally block) buttons for content made by someone else. */
export function SafetyActions({
  targetKind,
  targetId,
  targetUid,
  name = 'this person',
}: SafetyActionsProps): ReactNode {
  const [blocked, setBlocked] = useState(() => safety.isBlocked(targetUid));

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
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
