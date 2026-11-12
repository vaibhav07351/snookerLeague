import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/shared/ui/BottomSheet';
import { Button } from '@/shared/ui/Button';
import { subscribeConfirms, type ConfirmRequest } from '@/shared/utils/confirm';
import { useStyles } from '@/theme/ThemeProvider';
import { fonts, spacing, typeScale, type Palette } from '@/theme/tokens';

/** DOM id of the confirm sheet's content (web), used to find its layer. */
const CONFIRM_NODE_ID = 'confirm-sheet';
/** Above every other sheet (React Native Web puts each modal at z-index 9999). */
const CONFIRM_LAYER = '10000';

/**
 * On the web every modal is a fixed layer at the same z-index, so the one that wins is
 * whichever container React Native Web happened to create last, and a sheet that re-renders
 * can end up in front of a newer one. The confirmation must always be on top, so its layer is
 * raised explicitly. Native presents modals in the order they open, so needs nothing.
 */
function useRaiseOnWeb(questionId: number | null): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || questionId === null || typeof document === 'undefined') {
      return;
    }
    let node: HTMLElement | null = document.getElementById(CONFIRM_NODE_ID);
    while (node && node.parentElement && node.parentElement !== document.body) {
      node = node.parentElement;
    }
    const layer = node?.firstElementChild;
    if (layer instanceof HTMLElement) {
      layer.style.zIndex = CONFIRM_LAYER;
    }
  }, [questionId]);
}

/**
 * Renders confirmAction() questions as a bottom sheet in the app's own look. Mount once,
 * near the root. Questions asked while one is open wait their turn; closing the sheet any
 * way other than the confirm button answers "no".
 */
export function ConfirmHost(): ReactNode {
  const styles = useStyles(makeStyles);
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  // The answer is given once per question, even if the sheet reports several closes; the
  // answered question's sheet then slides away.
  const [answeredId, setAnsweredId] = useState<number | null>(null);
  const current = queue[0] ?? null;
  useRaiseOnWeb(current?.id ?? null);

  useEffect(
    () =>
      subscribeConfirms((request) => {
        setQueue((q) => [...q, request]);
      }),
    [],
  );

  // Unmounting (e.g. sign out mid-question) answers "no", so no caller waits forever.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(
    () => () => {
      queueRef.current.forEach((r) => r.resolve(false));
    },
    [],
  );

  const answer = useCallback(
    (ok: boolean): void => {
      if (!current || answeredId === current.id) {
        return;
      }
      setAnsweredId(current.id);
      current.resolve(ok);
      // Next question once this sheet has slid away.
      setTimeout(() => setQueue((q) => q.slice(1)), CLOSE_GAP_MS);
    },
    [current, answeredId],
  );

  if (!current) {
    return null;
  }
  // Mounted per question (keyed), so each question gets a fresh sheet and layer.
  return (
    <BottomSheet
      key={current.id}
      visible={answeredId !== current.id}
      title={current.title}
      onClose={() => answer(false)}
    >
      <View style={styles.body} nativeID={CONFIRM_NODE_ID}>
        {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
        <View style={styles.buttons}>
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => answer(false)}
            style={styles.button}
          />
          <Button
            label={current.confirmLabel}
            variant={current.tone === 'danger' ? 'danger' : 'primary'}
            onPress={() => answer(true)}
            style={styles.button}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

/** Slightly longer than the sheet's close animation. */
const CLOSE_GAP_MS = 260;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    body: {
      gap: spacing.lg,
      paddingBottom: spacing.sm,
    },
    message: {
      fontFamily: fonts.body,
      fontSize: typeScale.bodyLarge,
      lineHeight: 22,
      color: c.textMuted,
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      minWidth: 0,
    },
  });
