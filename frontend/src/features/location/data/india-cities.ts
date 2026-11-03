import { INDIA_PLACES_DATA, INDIA_STATES } from '@/features/location/data/india-places.generated';

export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  population: number;
}

let cities: City[] | null = null;
let byId: Map<string, City> | null = null;

function parse(): City[] {
  const parsed: City[] = [];
  for (const row of INDIA_PLACES_DATA.split('\n')) {
    const [id, name, stateIndex, lat, lon, population] = row.split('|');
    const state = INDIA_STATES[Number(stateIndex)];
    if (!id || !name || state === undefined) {
      continue;
    }
    parsed.push({
      id,
      name,
      state,
      lat: Number(lat),
      lon: Number(lon),
      population: Number(population),
    });
  }
  return parsed;
}

/** Indian towns of 5,000+ people (GeoNames), biggest first. Parsed once on first use. */
export function getIndiaCities(): readonly City[] {
  cities ??= parse();
  return cities;
}

export function findIndiaCity(cityId: string): City | null {
  byId ??= new Map(getIndiaCities().map((c) => [c.id, c]));
  return byId.get(cityId) ?? null;
}
