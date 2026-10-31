import { apiErrorMeta, freshAccessToken } from '@/shared/api/client';
import type { ServerDoc } from '@/shared/api/sync-api';
import { getApiBaseUrl } from '@/shared/config/env';
import { logger } from '@/shared/logging/logger';
import { getStore } from '@/shared/storage/local-store';
import { applyServerDocs } from '@/shared/sync/apply';
import { shouldCloudSync } from '@/shared/sync/cloud-session';

const MAX_BACKOFF_MS = 30_000;

interface LiveMessage {
  type: 'match' | 'error';
  doc?: ServerDoc;
  code?: string;
}

/** Codes after which reconnecting can't help (no access, or the match is gone). */
const FINAL_CODES = new Set(['forbidden', 'not_found', 'unauthorized']);

/**
 * Watch one match live: the server pushes every save over a WebSocket, and each copy is
 * merged into the store like a pull (so the screen updates through the usual store reload).
 * Reconnects with backoff; the regular 10 s poll keeps working underneath if this fails.
 * Returns a function that stops watching.
 */
export function watchMatchLive(matchId: string): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1_000;

  const schedule = (): void => {
    if (stopped) {
      return;
    }
    retry = setTimeout(() => void connect(), backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  };

  const connect = async (): Promise<void> => {
    if (stopped || !shouldCloudSync(getStore().user)) {
      return;
    }
    let token: string;
    try {
      token = await freshAccessToken();
    } catch (error) {
      logger.warn('sync.live', 'No session for live watching; retrying', apiErrorMeta(error));
      schedule();
      return;
    }
    if (stopped) {
      return;
    }
    const url = `${getApiBaseUrl().replace(/^http/, 'ws')}/v1/live/matches/${encodeURIComponent(matchId)}`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ token }));
    };
    ws.onmessage = (event) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(event.data)) as LiveMessage;
      } catch (error) {
        logger.warn('sync.live', 'Ignoring a malformed live message', {
          shape: error instanceof Error ? error.name : 'unknown',
        });
        return;
      }
      if (msg.type === 'match' && msg.doc) {
        backoff = 1_000;
        void applyServerDocs([msg.doc]);
      } else if (msg.type === 'error' && msg.code && FINAL_CODES.has(msg.code)) {
        logger.info('sync.live', 'Live watch refused', { matchId, code: msg.code });
        stopped = true;
      }
    };
    ws.onclose = () => {
      socket = null;
      schedule();
    };
    ws.onerror = () => {
      // onclose follows and schedules the reconnect.
    };
  };

  void connect();
  return () => {
    stopped = true;
    if (retry) {
      clearTimeout(retry);
    }
    socket?.close();
    socket = null;
  };
}
