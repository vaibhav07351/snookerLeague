import type { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ShareResultCard } from '@/features/result/components/ShareResultCard';
import type { ResultView } from '@/features/result/types/result.types';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { spacing } from '@/theme/tokens';

export interface ResultAction {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
}

interface ResultActionBarProps {
  /** The finished result to share; null hides Share (e.g. while a game is live). */
  view: ResultView | null;
  /** The screen's own buttons after Share, e.g. Rematch, Details, More. */
  actions: ResultAction[];
}

/**
 * One row of buttons under a game: Share first (it opens the share card sheet), then the
 * screen's own actions. The same on match, race and free-for-all screens.
 */
export function ResultActionBar({ view, actions }: ResultActionBarProps): ReactNode {
  const [sharing, setSharing] = useState(false);
  return (
    <>
      <View style={styles.bar}>
        {view ? (
          <Button
            label="Share"
            icon="share-social-outline"
            size="sm"
            onPress={() => setSharing(true)}
            style={styles.flex}
          />
        ) : null}
        {actions.map((a) => (
          <Button
            key={a.key}
            label={a.label}
            icon={a.icon}
            size="sm"
            variant="secondary"
            disabled={a.disabled}
            onPress={a.onPress}
            style={styles.flex}
          />
        ))}
      </View>
      {view ? (
        <BottomSheet visible={sharing} title="Share the result" onClose={() => setSharing(false)}>
          <ShareResultCard view={view} />
        </BottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
});
