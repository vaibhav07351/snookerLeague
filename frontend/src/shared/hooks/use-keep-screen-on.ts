import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { logger } from '@/shared/logging/logger';

/**
 * Keep the phone's screen on while `active` (a live game being scored), so it never dims or
 * locks between shots. Released as soon as `active` turns false or the screen closes. `tag`
 * names the screen, so two screens never release each other's lock. Where the browser can't
 * (older web browsers), scoring simply works as before.
 */
export function useKeepScreenOn(active: boolean, tag: string): void {
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    activateKeepAwakeAsync(tag).catch((error: unknown) => {
      logger.warn('keep-screen-on', 'Could not keep the screen on', {
        tag,
        shape: error instanceof Error ? error.name : 'unknown',
      });
    });
    return () => {
      deactivateKeepAwake(tag).catch((error: unknown) => {
        logger.warn('keep-screen-on', 'Could not release the screen lock', {
          tag,
          shape: error instanceof Error ? error.name : 'unknown',
        });
      });
    };
  }, [active, tag]);
}
