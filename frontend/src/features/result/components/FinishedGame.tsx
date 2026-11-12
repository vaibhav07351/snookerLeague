import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ResultActionBar, type ResultAction } from '@/features/result/components/ResultActionBar';
import { ResultCelebration } from '@/features/result/components/ResultCelebration';
import type { ResultView } from '@/features/result/types/result.types';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { spacing } from '@/theme/tokens';

interface FinishedGameProps {
  view: ResultView;
  /** Extra line on the result card, e.g. why the winner won. */
  detail?: string | null;
  /** Full table and per-player lines, shown in the Details sheet. */
  details: ReactNode;
  /**
   * Rare actions (reopen, delete) for the More sheet; null hides More. Each button should
   * run its action through `afterClose`, which closes the sheet first so the confirmation
   * that follows can open.
   */
  more: ((afterClose: (action: () => void) => void) => ReactNode) | null;
}

/** Time for a bottom sheet's slide-out before another sheet can safely open. */
const SHEET_CLOSE_MS = 400;

/**
 * The finished screen of a race or free-for-all, laid out like a finished match: the result
 * card, then Share / Details / More, with the full table one tap away.
 */
export function FinishedGame({ view, detail = null, details, more }: FinishedGameProps): ReactNode {
  const [sheet, setSheet] = useState<'details' | 'more' | null>(null);
  const close = (): void => setSheet(null);
  const afterClose = (action: () => void): void => {
    close();
    setTimeout(action, SHEET_CLOSE_MS);
  };
  const actions: ResultAction[] = [
    { key: 'details', label: 'Details', icon: 'list-outline', onPress: () => setSheet('details') },
    ...(more
      ? [
          {
            key: 'more',
            label: 'More',
            icon: 'ellipsis-horizontal' as const,
            onPress: () => setSheet('more'),
          },
        ]
      : []),
  ];
  return (
    <View style={styles.wrap}>
      <ResultCelebration view={view} detail={detail} />
      <ResultActionBar view={view} actions={actions} />
      <BottomSheet visible={sheet === 'details'} title="Result details" onClose={close}>
        {details}
      </BottomSheet>
      {more ? (
        <BottomSheet visible={sheet === 'more'} title="Options" onClose={close}>
          {more(afterClose)}
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
});
