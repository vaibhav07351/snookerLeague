import type { GroupStats, StandardStats } from '@/shared/types/domain';

/** Frame clock figures across two-sided matches and free-for-all frames together. */
export interface FramePace {
  timedFrames: number;
  totalFrameSeconds: number;
  avgFrameSeconds: number | null;
  avgWinFrameSeconds: number | null;
  avgLossFrameSeconds: number | null;
  fastestFrameSeconds: number | null;
  slowestFrameSeconds: number | null;
}

function avgOrNull(sum: number, count: number): number | null {
  return count > 0 ? Math.round(sum / count) : null;
}

function pick(
  a: number | null | undefined,
  b: number | null | undefined,
  choose: (x: number, y: number) => number,
): number | null {
  if (a == null) {
    return b ?? null;
  }
  return b == null ? a : choose(a, b);
}

/**
 * Combines a player's match and free-for-all frame times. Match stats keep only win / loss
 * averages (they mirror the server's numbers), so their sums are rebuilt as average x count.
 * That is off by at most half a second per average, below what the m:ss display shows.
 */
export function combinedFramePace(s: StandardStats, g: GroupStats | undefined): FramePace {
  const sWon = s.timedFramesWon ?? 0;
  const sLost = s.timedFramesLost ?? 0;
  const timedFrames = (s.timedFrames ?? 0) + (g?.timedFrames ?? 0);
  const totalFrameSeconds = (s.totalFrameSeconds ?? 0) + (g?.totalFrameSeconds ?? 0);
  const won = sWon + (g?.timedFramesWon ?? 0);
  const lost = sLost + (g?.timedFramesLost ?? 0);
  const winSeconds = (s.avgWinFrameSeconds ?? 0) * sWon + (g?.winFrameSeconds ?? 0);
  const lossSeconds = (s.avgLossFrameSeconds ?? 0) * sLost + (g?.lossFrameSeconds ?? 0);
  return {
    timedFrames,
    totalFrameSeconds,
    avgFrameSeconds: avgOrNull(totalFrameSeconds, timedFrames),
    avgWinFrameSeconds: avgOrNull(winSeconds, won),
    avgLossFrameSeconds: avgOrNull(lossSeconds, lost),
    fastestFrameSeconds: pick(s.fastestFrameSeconds, g?.fastestFrameSeconds, Math.min),
    slowestFrameSeconds: pick(s.slowestFrameSeconds, g?.slowestFrameSeconds, Math.max),
  };
}
