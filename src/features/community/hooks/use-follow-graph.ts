import { useCallback, useState } from 'react';

import { listFollowGraph } from '@/features/community/services/follow.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { FollowEdge } from '@/shared/types/domain';

export function useFollowGraph(uid: string | null): {
  followers: FollowEdge[];
  following: FollowEdge[];
  reload: () => Promise<void>;
} {
  const [followers, setFollowers] = useState<FollowEdge[]>([]);
  const [following, setFollowing] = useState<FollowEdge[]>([]);

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

  useStoreReload(reload, uid);

  return { followers, following, reload };
}
