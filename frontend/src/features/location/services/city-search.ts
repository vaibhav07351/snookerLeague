import { findIndiaCity, getIndiaCities, type City } from '@/features/location/data/india-cities';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const POPULAR_COUNT = 15;
const SEARCH_LIMIT = 40;
/** A town further than this is not "where you play". */
const DETECT_RADIUS_KM = 40;
/** Distances under this count as "in town", so a big town beats a village next door. */
const IN_TOWN_KM = 2;
const EARTH_RADIUS_KM = 6371;

/** Old or common spellings people type → the city id they mean. */
export const SEARCH_ALIASES: Readonly<Record<string, string>> = {
  bangalore: 'bengaluru',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  poona: 'pune',
  baroda: 'vadodara',
  trivandrum: 'thiruvananthapuram',
  cochin: 'kochi',
  calicut: 'kozhikode',
  trichy: 'tiruchirappalli',
  gurgaon: 'gurgaon',
  allahabad: 'allahabad',
  benares: 'varanasi',
  banaras: 'varanasi',
  mysore: 'mysuru',
  mangalore: 'mangalore',
  hubli: 'hubli',
  belgaum: 'belgaum',
  gulbarga: 'gulbarga',
  bellary: 'bellary',
  trichur: 'thrissur',
  quilon: 'kollam',
  alleppey: 'alappuzha',
  pondicherry: 'pondicherry',
  aurangabad: 'aurangabad',
};

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Lower is better: exact name, name prefix, word prefix, anywhere in name, state prefix. */
function matchRank(city: City, q: string): number | null {
  const name = city.name.toLowerCase();
  if (name === q) {
    return 0;
  }
  if (name.startsWith(q)) {
    return 1;
  }
  if (name.split(/[\s-]+/).some((word) => word.startsWith(q))) {
    return 2;
  }
  if (name.includes(q)) {
    return 3;
  }
  if (q.length >= 3 && city.state.toLowerCase().startsWith(q)) {
    return 4;
  }
  return null;
}

export function popularCities(): City[] {
  return getIndiaCities().slice(0, POPULAR_COUNT);
}

/**
 * Ranked town search. The list is already biggest-first, so bucketing by rank keeps
 * bigger towns above smaller ones with the same rank. One pass over ~6.5k towns.
 */
export function searchCities(query: string, limit: number = SEARCH_LIMIT): City[] {
  const q = normalize(query);
  if (q.length === 0) {
    return popularCities();
  }
  const buckets: City[][] = [[], [], [], [], []];
  const aliasId = SEARCH_ALIASES[q];
  const alias = aliasId ? findIndiaCity(aliasId) : null;
  if (alias) {
    buckets[0]?.push(alias);
  }
  for (const city of getIndiaCities()) {
    if (city === alias) {
      continue;
    }
    const rank = matchRank(city, q);
    if (rank !== null) {
      buckets[rank]?.push(city);
    }
  }
  return buckets.flat().slice(0, limit);
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance (haversine). */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function cityCoords(city: City): Coordinates {
  return { latitude: city.lat, longitude: city.lon };
}

export function nearestCities(at: Coordinates, count: number): City[] {
  return getIndiaCities()
    .map((city) => ({ city, km: distanceKm(at, cityCoords(city)) }))
    .filter((c) => c.km <= DETECT_RADIUS_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
    .map((c) => c.city);
}

/**
 * The town someone at these coordinates most likely calls home: population pulls,
 * distance pushes (population / distance²), so a Delhi suburb maps to Delhi but
 * Ghaziabad stays Ghaziabad. Null when no town is within reach (e.g. abroad).
 */
export function cityForCoordinates(at: Coordinates): City | null {
  let best: City | null = null;
  let bestScore = 0;
  for (const city of getIndiaCities()) {
    if (city.population <= 0) {
      continue;
    }
    const km = distanceKm(at, cityCoords(city));
    if (km > DETECT_RADIUS_KM) {
      continue;
    }
    const score = city.population / Math.max(km, IN_TOWN_KM) ** 2;
    if (score > bestScore) {
      best = city;
      bestScore = score;
    }
  }
  return best;
}
