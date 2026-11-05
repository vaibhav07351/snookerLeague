import type { FeedEvent } from '@/shared/types/domain';

/**
 * Each finished match or free-for-all has at most one result post in the feed, so its id is
 * derived from the match id: finishing again replaces the post instead of adding another.
 */
export function resultEventId(subjectId: string): string {
  return `ev_result_${subjectId}`;
}

/**
 * Put a match's result post into the feed list, or withdraw it.
 * - `event` given: add it, or replace the earlier post for this match.
 * - `event` null: mark an existing post as retracted (the result was undone).
 * Returns the new list and the post that changed (to sync), or null when nothing changed.
 */
export function applyResultEvent(
  events: FeedEvent[],
  subjectId: string,
  event: FeedEvent | null,
  now: string,
): { events: FeedEvent[]; changed: FeedEvent | null } {
  const id = resultEventId(subjectId);
  const existing = events.find((e) => e.id === id);
  if (event) {
    const next: FeedEvent = { ...event, id, retracted: false };
    const rest = events.filter((e) => e.id !== id);
    return { events: [...rest, next], changed: next };
  }
  if (!existing || existing.retracted) {
    return { events, changed: null };
  }
  const retracted: FeedEvent = { ...existing, retracted: true, updatedAt: now };
  return { events: events.map((e) => (e.id === id ? retracted : e)), changed: retracted };
}

/** Feed posts to show: everything except withdrawn results. */
export function visibleEvents(events: FeedEvent[]): FeedEvent[] {
  return events.filter((e) => !e.retracted);
}
