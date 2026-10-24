import { z } from 'zod';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import * as cityHubService from '@/features/league/services/city-hub.service';
import { INDIA_CITIES, type City } from '@/features/location/data/india-cities';
import * as profileService from '@/features/community/services/profile.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleUserProfileSync } from '@/shared/sync';

const cityIdSchema = z.string().trim().min(2).max(48);
const POSITION_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 10_000;

/** Common geocoder spellings → our city list names. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: 'bengaluru',
  bengalooru: 'bengaluru',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  madras: 'chennai',
  poona: 'pune',
  baroda: 'vadodara',
  trivandrum: 'thiruvananthapuram',
  tvm: 'thiruvananthapuram',
  cochin: 'kochi',
  calicut: 'kozhikode',
  trichy: 'tiruchirappalli',
  tiruchi: 'tiruchirappalli',
  gurgaon: 'gurugram',
  allahabad: 'prayagraj',
  benares: 'varanasi',
  kashi: 'varanasi',
  mysore: 'mysuru',
  mangalore: 'mangaluru',
  hubli: 'hubballi',
  belgaum: 'belagavi',
  belgaom: 'belagavi',
  gulbarga: 'kalaburagi',
  bellary: 'ballari',
  trichur: 'thrissur',
  quilon: 'kollam',
  alleppey: 'alappuzha',
  pondicherry: 'puducherry',
  pondichéry: 'puducherry',
  aurangabad: 'chhatrapati sambhajinagar',
  sambhajinagar: 'chhatrapati sambhajinagar',
  cstm: 'mumbai',
  'new delhi': 'new delhi',
  'delhi ncr': 'delhi',
  'navi mumbai': 'navi mumbai',
  'pimpri chinchwad': 'pimpri-chinchwad',
  pimpri: 'pimpri-chinchwad',
  secunderabad: 'secunderabad',
  howrah: 'howrah',
};

type PlaceParts = {
  city?: string | null;
  subregion?: string | null;
  district?: string | null;
  region?: string | null;
  name?: string | null;
  locality?: string | null;
};

export function listCities(): City[] {
  return INDIA_CITIES;
}

export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) {
    return INDIA_CITIES;
  }
  return INDIA_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q) || c.id.includes(q),
  );
}

export function citiesByLetter(letter: string): City[] {
  const ch = letter.trim().toUpperCase().charAt(0);
  return INDIA_CITIES.filter((c) => c.name.toUpperCase().startsWith(ch));
}

export function getCityById(cityId: string): City | null {
  return INDIA_CITIES.find((c) => c.id === cityId) ?? null;
}

function normalizePlaceToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
}

function matchCityFromPlace(place: PlaceParts): City | null {
  const parts = [
    place.city,
    place.locality,
    place.name,
    place.subregion,
    place.district,
    place.region,
  ]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map(normalizePlaceToken);

  for (const part of parts) {
    const aliased = CITY_ALIASES[part] ?? part;
    const exact = INDIA_CITIES.find(
      (c) => c.name.toLowerCase() === aliased || c.id === aliased.replace(/\s+/g, '-'),
    );
    if (exact) {
      return exact;
    }
  }

  for (const part of parts) {
    const aliased = CITY_ALIASES[part] ?? part;
    const fuzzy = INDIA_CITIES.find((c) => {
      const name = c.name.toLowerCase();
      return (
        aliased.includes(name) ||
        name.includes(aliased) ||
        c.id.includes(aliased.replace(/\s+/g, '-'))
      );
    });
    if (fuzzy) {
      return fuzzy;
    }
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AppError('TIMEOUT', `${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Expo removed reverse geocoding on web (SDK 49+). Use a CORS-friendly client
 * reverse-geocode endpoint — no API key, never logs coordinates.
 */
async function reverseGeocodeWeb(latitude: number, longitude: number): Promise<PlaceParts[]> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${encodeURIComponent(String(latitude))}` +
    `&longitude=${encodeURIComponent(String(longitude))}` +
    `&localityLanguage=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new AppError('NETWORK', 'Could not look up your city from coordinates');
    }
    const data = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
      localityInfo?: {
        administrative?: Array<{ name?: string; description?: string; order?: number }>;
      };
    };
    const adminNames =
      data.localityInfo?.administrative
        ?.map((a) => a.name)
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0) ?? [];
    return [
      {
        city: data.city ?? null,
        locality: data.locality ?? null,
        name: adminNames[0] ?? null,
        district: adminNames[1] ?? null,
        subregion: data.locality ?? adminNames[0] ?? null,
        region: data.principalSubdivision ?? null,
      },
    ];
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      'NETWORK',
      'Could not look up your city. Check your connection, or search the list.',
    );
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocode(latitude: number, longitude: number): Promise<PlaceParts[]> {
  if (Platform.OS === 'web') {
    return reverseGeocodeWeb(latitude, longitude);
  }
  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  return places.map((p) => ({
    city: p.city,
    subregion: p.subregion,
    district: p.district,
    region: p.region,
    name: p.name,
  }));
}

/** Reverse-geocode to a known city. Never logs coordinates. */
export async function suggestCityFromDevice(): Promise<City> {
  const services = await Location.getProviderStatusAsync();
  if (!services.locationServicesEnabled) {
    throw new AppError(
      'LOCATION_DISABLED',
      Platform.OS === 'web'
        ? 'Location is blocked in this browser. Allow location access for this site, or search the list.'
        : 'Turn on location services, then try again — or search the list.',
    );
  }

  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new AppError(
      'LOCATION_DENIED',
      Platform.OS === 'web'
        ? 'Location permission was denied. Allow it in the browser address bar, or search the list.'
        : 'Location permission was denied. Enable it in Settings, or search the list.',
    );
  }

  let pos = await Location.getLastKnownPositionAsync({
    maxAge: 5 * 60_000,
    requiredAccuracy: 5_000,
  });
  if (!pos) {
    pos = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      POSITION_TIMEOUT_MS,
      'Getting your location',
    );
  }

  const places = await withTimeout(
    reverseGeocode(pos.coords.latitude, pos.coords.longitude),
    GEOCODE_TIMEOUT_MS,
    'Looking up your city',
  );
  const first = places[0];
  if (!first) {
    throw new AppError('LOCATION_UNMATCHED', 'We could not read an address for your location.');
  }

  const city = matchCityFromPlace(first);
  if (!city) {
    logger.info('location.service', 'Suggested city unmatched', {
      hasCity: Boolean(first.city ?? first.locality),
      hasRegion: Boolean(first.region),
    });
    throw new AppError(
      'LOCATION_UNMATCHED',
      'We could not match your location to a city in our list. Search and pick one instead.',
    );
  }

  logger.info('location.service', 'Suggested city from device', { cityId: city.id });
  return city;
}

export async function skipCityForDemo(): Promise<void> {
  await loadStore();
  const user = getStore().user;
  if (!user?.isDemo) {
    throw new AppError('FORBIDDEN', 'Only demo profiles can skip city');
  }
  await updateStore((s) => ({
    ...s,
    user: s.user ? { ...s.user, citySkipped: true } : s.user,
  }));
}

export async function setUserCity(cityId: string): Promise<City> {
  const parsed = cityIdSchema.safeParse(cityId);
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Pick a city from the list');
  }
  const city = getCityById(parsed.data);
  if (!city) {
    throw new AppError('VALIDATION', 'Unknown city');
  }

  await loadStore();
  const user = getStore().user;
  if (!user) {
    throw new AppError('UNAUTHENTICATED', 'Sign in first');
  }

  const previousCityId = user.cityId;
  await updateStore((s) => ({
    ...s,
    user: s.user
      ? {
          ...s.user,
          cityId: city.id,
          cityName: city.name,
          citySkipped: false,
        }
      : s.user,
  }));

  await scheduleUserProfileSync();
  await profileService.upsertOwnProfile({
    cityId: city.id,
    cityName: city.name,
  });

  await cityHubService.ensureCityHub({
    cityId: city.id,
    cityName: city.name,
    uid: user.uid,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    leaveCityId: previousCityId && previousCityId !== city.id ? previousCityId : null,
  });

  logger.info('location.service', 'City set', { cityId: city.id });
  return city;
}
