/**
 * Cross-platform user notifications. `Alert.alert` is a no-op on react-native-web, so
 * errors and confirmations go through this emitter and are rendered by <ToastHost />.
 */
export type ToastKind = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function emit(kind: ToastKind, title: string, message?: string): void {
  const toast: ToastMessage = { id: nextId++, kind, title, message };
  for (const listener of listeners) {
    listener(toast);
  }
}

export const notify = {
  success(title: string, message?: string): void {
    emit('success', title, message);
  },
  error(title: string, message?: string): void {
    emit('error', title, message);
  },
  info(title: string, message?: string): void {
    emit('info', title, message);
  },
};

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
