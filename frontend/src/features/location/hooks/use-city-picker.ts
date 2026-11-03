import { useCallback, useEffect, useMemo, useState } from 'react';

import * as locationService from '@/features/location/services/location.service';
import type { City, DetectedCity } from '@/features/location/services/location.service';
import { toUserMessage } from '@/shared/errors/app-error';

export type Detection =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'found'; result: DetectedCity }
  | { status: 'failed'; message: string };

export interface CityPicker {
  query: string;
  setQuery: (query: string) => void;
  /** Search results, or the "near you" / popular list when the query is empty. */
  cities: City[];
  listLabel: string;
  detection: Detection;
  /** Asks for permission if needed. */
  detect: () => Promise<void>;
}

export function useCityPicker(): CityPicker {
  const [query, setQuery] = useState('');
  const [detection, setDetection] = useState<Detection>({ status: 'idle' });

  // Permission already granted: fill in the town without asking. Otherwise wait for a tap.
  useEffect(() => {
    let active = true;
    void locationService.detectCityIfAllowed().then((result) => {
      if (active && result) {
        setDetection((prev) => (prev.status === 'idle' ? { status: 'found', result } : prev));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const detect = useCallback(async (): Promise<void> => {
    setDetection({ status: 'detecting' });
    try {
      const result = await locationService.detectCity();
      setDetection({ status: 'found', result });
    } catch (error) {
      setDetection({ status: 'failed', message: toUserMessage(error) });
    }
  }, []);

  const hasQuery = query.trim().length > 0;
  const nearby = useMemo(
    () => (detection.status === 'found' ? detection.result.nearby : []),
    [detection],
  );
  const cities = useMemo(
    () => (!hasQuery && nearby.length > 0 ? nearby : locationService.searchCities(query)),
    [hasQuery, nearby, query],
  );
  const listLabel = hasQuery ? 'Results' : nearby.length > 0 ? 'Also near you' : 'Popular cities';

  return { query, setQuery, cities, listLabel, detection, detect };
}
