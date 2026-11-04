/**
 * Playing order for games where players take turns one at a time (races, free-for-all frames).
 * The order is a cycle of player ids; players who are out are skipped, not removed, so they
 * keep their seat if they come back (e.g. an undone finish).
 */

/** The saved order cleaned against the current players: unknown and repeated ids are dropped,
 * players missing from it are added at the end in their listed order. */
export function resolveTurnOrder(
  saved: readonly string[] | undefined,
  playerIds: readonly string[],
): string[] {
  const known = new Set(playerIds);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of saved ?? []) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  for (const id of playerIds) {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}

/**
 * The next active player after `fromId` in the order. `fromId` may be out (just finished);
 * the walk still starts from their seat. Returns `fromId` itself when they are the only one
 * left, and null when nobody is active.
 */
export function nextInTurn(
  order: readonly string[],
  activeIds: readonly string[],
  fromId: string | null,
): string | null {
  const active = new Set(activeIds);
  if (active.size === 0 || order.length === 0) {
    return null;
  }
  const start = fromId ? order.indexOf(fromId) : -1;
  for (let step = 1; step <= order.length; step += 1) {
    const id = order[(start + step + order.length) % order.length];
    if (id && active.has(id)) {
      return id;
    }
  }
  return null;
}

/**
 * Seat `playerId` directly after `previousId`. Used when the scorer picks the next player by
 * hand: the table's real order is learned so the rotation follows it from then on.
 */
export function movePlayerAfter(
  order: readonly string[],
  previousId: string,
  playerId: string,
): string[] {
  if (previousId === playerId || !order.includes(previousId) || !order.includes(playerId)) {
    return [...order];
  }
  const without = order.filter((id) => id !== playerId);
  const at = without.indexOf(previousId);
  return [...without.slice(0, at + 1), playerId, ...without.slice(at + 1)];
}
