import { useCallback, useEffect, useState } from 'react';

import { readPreference, writePreference } from '@/shared/storage/preferences';

const HINT_PREFIX = 'hint.';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Every dismissible card, so "Replay app tour" can bring them back (guided tips: features/tour). */
export const HINT_KEYS = ['home-getting-started', 'home-link-google'] as const;

export type HintKey = (typeof HINT_KEYS)[number];

/** One-time tip: visible until dismissed on this device. */
export function useHint(key: HintKey): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void readPreference(HINT_PREFIX + key).then((value) => {
        if (!cancelled) {
          setVisible(value !== 'dismissed');
        }
      });
    };
    load();
    listeners.add(load);
    return () => {
      cancelled = true;
      listeners.delete(load);
    };
  }, [key]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void writePreference(HINT_PREFIX + key, 'dismissed');
  }, [key]);

  return { visible, dismiss };
}

/** Bring every dismissed card back (Settings > "Replay app tour"). */
export async function resetHints(): Promise<void> {
  await Promise.all(HINT_KEYS.map((key) => writePreference(HINT_PREFIX + key, null)));
  for (const listener of listeners) {
    listener();
  }
}
