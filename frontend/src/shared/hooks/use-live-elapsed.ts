import { useEffect, useState } from 'react';

/** Whole seconds since `startedAt`, ticking once a second while `enabled`; 0 otherwise. */
export function useLiveElapsed(startedAt: string | null | undefined, enabled: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!enabled || !startedAt) {
      setElapsed(0);
      return undefined;
    }
    const start = Date.parse(startedAt);
    const tick = (): void => {
      setElapsed(Number.isNaN(start) ? 0 : Math.max(0, Math.floor((Date.now() - start) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt, enabled]);
  return elapsed;
}
