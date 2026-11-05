import { describe, expect, it } from '@jest/globals';

import type { FeedEvent } from '@/shared/types/domain';
import { applyResultEvent, resultEventId, visibleEvents } from '@/shared/utils/result-event';

const T1 = '2026-11-05T10:00:00.000Z';
const T2 = '2026-11-05T11:00:00.000Z';

function post(title: string, at: string): FeedEvent {
  return {
    id: 'ignored',
    leagueId: 'l1',
    type: 'match_won',
    createdAt: at,
    updatedAt: at,
    title,
    body: 'Best of 3',
    relatedIds: ['m1'],
  };
}

describe('applyResultEvent', () => {
  it('keeps one post per match when it is finished twice', () => {
    const first = applyResultEvent([], 'm1', post('Match complete', T1), T1);
    const again = applyResultEvent(first.events, 'm1', post('Match complete', T2), T2);
    expect(again.events).toHaveLength(1);
    expect(again.events[0]?.id).toBe(resultEventId('m1'));
    expect(again.events[0]?.createdAt).toBe(T2);
  });

  it('withdraws the post when the result is undone, and hides it', () => {
    const first = applyResultEvent([], 'm1', post('Match complete', T1), T1);
    const undone = applyResultEvent(first.events, 'm1', null, T2);
    expect(undone.changed?.retracted).toBe(true);
    expect(visibleEvents(undone.events)).toHaveLength(0);
    // Finishing again brings a fresh, visible post back.
    const redone = applyResultEvent(undone.events, 'm1', post('Match complete', T2), T2);
    expect(visibleEvents(redone.events)).toHaveLength(1);
  });

  it('changes nothing when there is no post to withdraw', () => {
    expect(applyResultEvent([], 'm1', null, T1).changed).toBeNull();
  });
});
