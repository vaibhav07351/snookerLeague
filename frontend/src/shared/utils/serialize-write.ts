const queues = new Map<string, Promise<unknown>>();

/**
 * Run writes to one document one at a time, in call order. Each write reads the latest copy
 * from the store, so without this two quick taps could both read the same state and one
 * change would be lost. A failed write does not block the ones queued after it.
 *
 * `key` must be unique across document kinds (e.g. prefix it with the kind).
 */
export function serializeWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(write, write);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) {
      queues.delete(key);
    }
  });
  return next;
}
