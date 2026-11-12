import { useCallback, useEffect, useState } from 'react';

import { listFollowGraph } from '@/features/community/services/follow.service';
import { useStoreReload, type LoadStatus, type StoreLoad } from '@/shared/hooks/use-store-reload';
import { logger } from '@/shared/logging/logger';
import type { FollowEdge } from '@/shared/types/domain';

export function useFollowGraph(uid: string | null): {
  followers: FollowEdge[];
  following: FollowEdge[];
  reload: () => Promise<void>;
  /** The server fetch: an error with nothing on this phone shows Retry. */
  load: StoreLoad;
} {
  const [followers, setFollowers] = useState<FollowEdge[]>([]);
  const [following, setFollowing] = useState<FollowEdge[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(async () => {
    if (!uid) {
      setFollowers([]);
      setFollowing([]);
      return;
    }
    const graph = await listFollowGraph(uid);
    setFollowers(graph.followers);
    setFollowing(graph.following);
  }, [uid]);

  // Local copy on every store change (cheap); the cloud is asked when the person changes.
  const reloadLocal = useCallback(async () => {
    if (!uid) {
      setFollowers([]);
      setFollowing([]);
      return;
    }
    const graph = await listFollowGraph(uid, { refresh: false });
    setFollowers(graph.followers);
    setFollowing(graph.following);
  }, [uid]);

  useStoreReload(reloadLocal, uid);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    reload().then(
      () => {
        if (live) {
          setStatus('ready');
        }
      },
      (error: unknown) => {
        logger.error('use-follow-graph', 'Follow graph load failed', {
          shape: error instanceof Error ? error.name : 'unknown',
        });
        if (live) {
          setStatus('error');
        }
      },
    );
    return () => {
      live = false;
    };
  }, [reload, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  // This phone's copy shows at once (and stays if the refresh fails); the spinner and the
  // error only show when there is nothing here yet.
  const shown: LoadStatus = followers.length + following.length > 0 ? 'ready' : status;

  return { followers, following, reload, load: { status: shown, retry } };
}
