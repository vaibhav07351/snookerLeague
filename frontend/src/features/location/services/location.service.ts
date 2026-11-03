import { z } from 'zod';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import * as cityHubService from '@/features/league/services/city-hub.service';
import { findIndiaCity, type City } from '@/features/location/data/india-cities';
import * as citySearch from '@/features/location/services/city-search';
import * as profileService from '@/features/community/services/profile.service';
import { AppError } from '@/shared/errors/app-error';
import { logger } from '@/shared/logging/logger';
import { getStore, loadStore, updateStore } from '@/shared/storage/local-store';
import { scheduleUserProfileSync } from '@/shared/sync';

export type { City };

const cityIdSchema = z.string().trim().min(2).max(48);
const POSITION_TIMEOUT_MS = 15_000;
const NEARBY_COUNT = 8;

export interface DetectedCity {
  city: City;
  /** Other towns close by, nearest first, for a "Near you" list. */
  nearby: City[];
}

export function searchCities(query: string): City[] {
  return citySearch.searchCities(query);
}

export function getCityById(cityId: string): City | null {
  return findIndiaCity(cityId);
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

/** Device position → nearest known town, entirely on device. Never logs or stores coordinates. */
async function detectFromPosition(): Promise<DetectedCity> {
  let pos = await Location.getLastKnownPositionAsync({
    maxAge: 5 * 60_000,
    requiredAccuracy: 5_000,
  });
  if (!pos) {
    pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      POSITION_TIMEOUT_MS,
      'Getting your location',
    );
  }
  const at = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  const city = citySearch.cityForCoordinates(at);
  if (!city) {
    logger.info('location.service', 'No town within reach of device position');
    throw new AppError(
      'LOCATION_UNMATCHED',
      'No town in India found near you. Search for your city instead.',
    );
  }
  logger.info('location.service', 'Detected city from device', { cityId: city.id });
  const nearby = citySearch.nearestCities(at, NEARBY_COUNT + 1).filter((c) => c.id !== city.id);
  return { city, nearby: nearby.slice(0, NEARBY_COUNT) };
}

/** Asks for location permission if needed, then detects the town. */
export async function detectCity(): Promise<DetectedCity> {
  const services = await Location.getProviderStatusAsync();
  if (!services.locationServicesEnabled) {
    throw new AppError(
      'LOCATION_DISABLED',
      Platform.OS === 'web'
        ? 'Location is blocked in this browser. Allow it for this site, or search instead.'
        : 'Turn on location services and try again, or search instead.',
    );
  }

  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    throw new AppError(
      'LOCATION_DENIED',
      Platform.OS === 'web'
        ? 'Location permission was denied. Allow it in the address bar, or search instead.'
        : 'Location permission was denied. Enable it in Settings, or search instead.',
    );
  }
  return detectFromPosition();
}

/**
 * Detects the town only when permission was already granted, never prompting.
 * Returns null when it can't (no permission, location off, nothing nearby).
 */
export async function detectCityIfAllowed(): Promise<DetectedCity | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return null;
    }
    const services = await Location.getProviderStatusAsync();
    if (!services.locationServicesEnabled) {
      return null;
    }
    return await detectFromPosition();
  } catch (error) {
    logger.info('location.service', 'Silent city detection skipped', {
      code: error instanceof AppError ? error.code : 'UNKNOWN',
    });
    return null;
  }
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
