import { describe, expect, it } from '@jest/globals';

import { isStale, splitByStaleness, STALE_AFTER_MS } from '@/features/home/services/live-staleness';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('isStale', () => {
  it('keeps a game changed a minute ago live', () => {
    expect(isStale(ago(60_000), NOW)).toBe(false);
  });

  it('keeps a game changed exactly 12 hours ago live', () => {
    expect(isStale(ago(STALE_AFTER_MS), NOW)).toBe(false);
  });

  it('marks a game idle for just over 12 hours stale', () => {
    expect(isStale(ago(STALE_AFTER_MS + 1), NOW)).toBe(true);
  });

  it('keeps a game stamped slightly in the future (clock skew) live', () => {
    expect(isStale(ago(-5 * 60_000), NOW)).toBe(false);
  });

  it('treats an unreadable timestamp as stale', () => {
    expect(isStale('not a date', NOW)).toBe(true);
  });
});

describe('splitByStaleness', () => {
  it('splits rows and keeps their order', () => {
    const rows = [
      { id: 'a', updatedAt: ago(1_000) },
      { id: 'b', updatedAt: ago(STALE_AFTER_MS * 2) },
      { id: 'c', updatedAt: ago(2_000) },
      { id: 'd', updatedAt: ago(STALE_AFTER_MS * 3) },
    ];
    const { live, stale } = splitByStaleness(rows, NOW);
    expect(live.map((r) => r.id)).toEqual(['a', 'c']);
    expect(stale.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('handles an empty list', () => {
    expect(splitByStaleness([], NOW)).toEqual({ live: [], stale: [] });
  });
});
