import { z } from 'zod';
import * as Location from 'expo-location';

import * as cityHubService from '@/features/league/services/city-hub.service';
import { INDIA_CITIES, type City } from '@/features/location/data/india-cities';
import * as profileService from '@/features/community/services/profile.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleUserProfileSync } from '@/shared/sync';

const cityIdSchema = z.string().trim().min(2).max(48);

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

function matchCityFromPlace(place: Location.LocationGeocodedAddress): City | null {
  const parts = [place.city, place.subregion, place.district, place.region]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .map((p) => p.trim().toLowerCase());
  for (const part of parts) {
    const exact = INDIA_CITIES.find((c) => c.name.toLowerCase() === part);
    if (exact) {
      return exact;
    }
  }
  for (const part of parts) {
    const fuzzy = INDIA_CITIES.find(
      (c) => part.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(part),
    );
    if (fuzzy) {
      return fuzzy;
    }
  }
  return null;
}

/** Reverse-geocode to a known city. Never logs coordinates. */
export async function suggestCityFromDevice(): Promise<City | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    return null;
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const places = await Location.reverseGeocodeAsync({
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  });
  const first = places[0];
  if (!first) {
    return null;
  }
  const city = matchCityFromPlace(first);
  logger.info('location.service', 'Suggested city from device', {
    cityId: city?.id ?? null,
  });
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
