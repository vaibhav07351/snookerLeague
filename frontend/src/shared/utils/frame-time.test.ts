import { describe, expect, it } from '@jest/globals';

import { frameSecondsOf, totalFrameSeconds } from '@/shared/utils/frame-time';

describe('frameSecondsOf', () => {
  it('accepts zero and positive readings', () => {
    expect(frameSecondsOf({ durationSeconds: 0 })).toBe(0);
    expect(frameSecondsOf({ durationSeconds: 95 })).toBe(95);
  });

  it('rejects missing, negative and non-finite readings', () => {
    expect(frameSecondsOf({})).toBeNull();
    expect(frameSecondsOf({ durationSeconds: -1 })).toBeNull();
    expect(frameSecondsOf({ durationSeconds: Number.NaN })).toBeNull();
    expect(frameSecondsOf({ durationSeconds: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe('totalFrameSeconds', () => {
  it('is null when no frame was timed', () => {
    expect(totalFrameSeconds([])).toBeNull();
    expect(totalFrameSeconds([{}, {}])).toBeNull();
  });

  it('adds only the timed frames', () => {
    expect(totalFrameSeconds([{ durationSeconds: 300 }, {}, { durationSeconds: 120 }])).toBe(420);
  });
});
