import { useCallback, useState } from 'react';

import * as profileService from '@/features/community/services/profile.service';
import * as cityHubService from '@/features/league/services/city-hub.service';
import { useStoreReload } from '@/shared/hooks/use-store-reload';
import type { PlayerProfile, SessionUser } from '@/shared/types/domain';

/**
 * City ranking: the city hub's players when this user is in one, otherwise the first page
 * of public profiles in their city.
 */
export function useCityBoard(user: SessionUser | null): PlayerProfile[] {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);

  const reload = useCallback(async () => {
    if (!user) {
      return;
    }
    const hub = await cityHubService.getCityHubForUser(user.uid);
    if (hub) {
      setProfiles(profileService.cityHubPlayersForRank(hub.id));
    } else if (user.cityId) {
      const page = await profileService.listCityProfiles({ cityId: user.cityId });
      setProfiles(page.items);
    } else {
      setProfiles([]);
    }
  }, [user]);

  useStoreReload(reload, user ? `${user.uid}:city` : null);
  return profiles;
}
