/** A game nobody has scored or changed for this long is no longer shown as live. */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/**
 * True when an in-progress game was last changed more than STALE_AFTER_MS ago.
 * Every scored shot bumps `updatedAt`, so this means "nobody has played it for 12 hours".
 * An unreadable timestamp counts as stale so a broken row never sits in "Live now" for ever.
 */
export function isStale(updatedAt: string, now: number): boolean {
  const changed = Date.parse(updatedAt);
  if (Number.isNaN(changed)) {
    return true;
  }
  return now - changed > STALE_AFTER_MS;
}

/** Splits rows into live (recently changed) and stale, keeping each list's order. */
export function splitByStaleness<T extends { updatedAt: string }>(
  rows: T[],
  now: number,
): { live: T[]; stale: T[] } {
  const live: T[] = [];
  const stale: T[] = [];
  for (const row of rows) {
    (isStale(row.updatedAt, now) ? stale : live).push(row);
  }
  return { live, stale };
}
