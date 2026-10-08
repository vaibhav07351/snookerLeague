/**
 * Whether the cloud answered recently. Set false when writes or reads fail with a network
 * error (offline, timeout, or a browser extension blocking Firestore); true on success.
 */
type Listener = (reachable: boolean) => void;

let reachable = true;
const listeners = new Set<Listener>();

export function setCloudReachable(next: boolean): void {
  if (next === reachable) {
    return;
  }
  reachable = next;
  for (const listener of listeners) {
    listener(reachable);
  }
}

export function isCloudReachable(): boolean {
  return reachable;
}

export function subscribeCloudReachable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
