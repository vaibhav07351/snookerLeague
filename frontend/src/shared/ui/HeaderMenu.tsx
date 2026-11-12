import type { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { HeaderIconButton } from '@/shared/ui/HeaderIconButton';
import { spacing } from '@/theme/tokens';

export interface HeaderMenuItem {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  /** Red, for actions that remove something. */
  danger?: boolean;
}

/** Time for the sheet's slide-out before the chosen action may open another sheet. */
const SHEET_CLOSE_MS = 400;

/**
 * "..." in a screen header: rare actions one tap away, so the screen keeps only its main
 * action. Choosing one closes the sheet first, so a confirmation it asks can open.
 */
export function HeaderMenu({
  title,
  items,
}: {
  title: string;
  items: HeaderMenuItem[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return null;
  }
  return (
    <>
      <HeaderIconButton icon="ellipsis-horizontal" label={title} onPress={() => setOpen(true)} />
      <BottomSheet visible={open} title={title} onClose={() => setOpen(false)}>
        <View style={styles.items}>
          {items.map((item) => (
            <Button
              key={item.key}
              label={item.label}
              icon={item.icon}
              variant={item.danger ? 'danger' : 'secondary'}
              onPress={() => {
                setOpen(false);
                setTimeout(item.onPress, SHEET_CLOSE_MS);
              }}
            />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  items: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
});
