/** Anything with an optional frame clock reading (match frames, free-for-all frames). */
export interface TimedFrameLike {
  durationSeconds?: number;
}

/** A usable frame clock reading: a finite, non-negative number of seconds. */
export function frameSecondsOf(frame: TimedFrameLike): number | null {
  const d = frame.durationSeconds;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null;
}

/** Total seconds across the timed frames, or null when no frame was timed. */
export function totalFrameSeconds(frames: readonly TimedFrameLike[]): number | null {
  let total: number | null = null;
  for (const frame of frames) {
    const d = frameSecondsOf(frame);
    if (d !== null) {
      total = (total ?? 0) + d;
    }
  }
  return total;
}
