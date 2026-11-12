import { Alert, Platform } from 'react-native';

export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmOptions {
  /** 'danger' (red button) for anything that removes or ends something. Default 'primary'. */
  tone?: ConfirmTone;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  tone: ConfirmTone;
  resolve: (ok: boolean) => void;
}

type Listener = (request: ConfirmRequest) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/** The in-app confirm sheet (<ConfirmHost />) listens here. */
export function subscribeConfirms(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Words that mean the action removes or ends something, shown with a red button. */
const DANGER_WORDS = /\b(delete|remove|discard|abandon|concede|leave|sign out|log out|block)\b/i;

/** System dialog, used only when no <ConfirmHost /> is mounted (tests, very early start-up). */
function systemConfirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Ask before doing something. Shown as an in-app sheet in the app's own look (the same on
 * phones and the web build); resolves true only when the confirm button is tapped.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel = 'OK',
  options: ConfirmOptions = {},
): Promise<boolean> {
  if (listeners.size === 0) {
    return systemConfirm(title, message, confirmLabel);
  }
  const tone = options.tone ?? (DANGER_WORDS.test(confirmLabel) ? 'danger' : 'primary');
  return new Promise((resolve) => {
    const request: ConfirmRequest = {
      id: nextId++,
      title,
      message,
      confirmLabel,
      tone,
      resolve,
    };
    for (const listener of listeners) {
      listener(request);
    }
  });
}
