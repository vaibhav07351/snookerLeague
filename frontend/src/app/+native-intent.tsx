import { logger } from '@/shared/logging/logger';

/**
 * Maps links from the public website (https://snookit.duckdns.org/m/<id> and friends, opened
 * through Android App Links) to the matching screens in the app. Anything else passes through.
 */
const ROUTES: [RegExp, (id: string) => string][] = [
  [/^\/m\/([^/?#]+)/, (id) => `/match/${id}`],
  [/^\/p\/([^/?#]+)/, (id) => `/(main)/city-player?uid=${id}`],
  [/^\/c\/([^/?#]+)/, () => '/(main)/(tabs)/community'],
  [/^\/t\/([^/?#]+)/, (id) => `/tournament/${id}`],
  [/^\/claim\/([^/?#]+)/, (token) => `/claim/${token}`],
];

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  let pathname = path;
  try {
    // Links can arrive as full URLs or as bare paths.
    pathname = new URL(path, 'https://snookit.duckdns.org').pathname;
  } catch (error) {
    // Not a URL we understand: let the router try it as is.
    logger.warn('native-intent', 'Unrecognised incoming link', {
      shape: error instanceof Error ? error.name : 'unknown',
    });
    return path;
  }
  for (const [pattern, to] of ROUTES) {
    const match = pattern.exec(pathname);
    if (match?.[1]) {
      return to(encodeURIComponent(decodeURIComponent(match[1])));
    }
  }
  return path;
}
