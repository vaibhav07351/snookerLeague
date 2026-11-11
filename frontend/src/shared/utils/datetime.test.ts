import { describe, expect, it } from '@jest/globals';

import { formatDayAndTime, formatGameStart, withDuration } from '@/shared/utils/datetime';

// Built from local time so the checks hold in any time zone; the locale decides the exact
// wording, so the tests compare against the same toLocale* calls.
const local = (day: number, hour: number, minute: number): Date =>
  new Date(2026, 10, day, hour, minute);
const time = (d: Date): string =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const date = (d: Date): string =>
  d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

describe('formatGameStart', () => {
  it('shows the date, then the start time only', () => {
    const start = local(11, 21, 30);
    const end = local(11, 21, 45);
    expect(formatGameStart(start.toISOString(), end.toISOString())).toBe(
      `${date(start)} · ${time(start)}`,
    );
  });

  it('falls back to the other time when the start is unreadable', () => {
    const end = local(11, 21, 45);
    expect(formatGameStart('bad', end.toISOString())).toBe(`${date(end)} · ${time(end)}`);
    expect(formatGameStart('bad', 'also bad')).toBe('');
  });
});

describe('withDuration', () => {
  it('adds how long the game took', () => {
    expect(withDuration('1st: Aman', 136)).toBe('1st: Aman · 2m 16s');
  });

  it('leaves untimed games alone', () => {
    expect(withDuration('1st: Aman', null)).toBe('1st: Aman');
  });
});

describe('formatDayAndTime', () => {
  it('names the day and the time', () => {
    const now = new Date();
    expect(formatDayAndTime(now.toISOString())).toBe(`Today, ${time(now)}`);
  });

  it('is empty when the time is unreadable', () => {
    expect(formatDayAndTime('bad')).toBe('');
    expect(formatDayAndTime(null)).toBe('');
  });
});
