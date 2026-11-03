import { describe, expect, it } from '@jest/globals';

import { findIndiaCity, getIndiaCities } from '@/features/location/data/india-cities';
import {
  cityForCoordinates,
  distanceKm,
  nearestCities,
  popularCities,
  SEARCH_ALIASES,
  searchCities,
} from '@/features/location/services/city-search';

import legacyCities from '../../../../scripts/data/legacy-cities.json';

const legacy: ReadonlyArray<{ id: string }> = legacyCities;

describe('india city data', () => {
  it('keeps every id users may already have saved', () => {
    const missing = legacy.filter((c) => !findIndiaCity(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it('has unique ids that fit the city id schema', () => {
    const ids = getIndiaCities().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length >= 2 && id.length <= 48)).toBe(true);
  });

  it('covers district towns like Bijnor', () => {
    expect(getIndiaCities().length).toBeGreaterThan(5000);
    expect(searchCities('bijnor')[0]).toMatchObject({ name: 'Bijnor', state: 'Uttar Pradesh' });
  });

  it('maps every alias to a real city', () => {
    const broken = Object.entries(SEARCH_ALIASES).filter(([, id]) => !findIndiaCity(id));
    expect(broken).toEqual([]);
  });
});

describe('searchCities', () => {
  it('shows popular cities for an empty query', () => {
    expect(searchCities('  ')).toEqual(popularCities());
    expect(popularCities()[0]?.id).toBe('mumbai');
  });

  it('puts name prefixes above matches inside the name', () => {
    const names = searchCities('mee').map((c) => c.name);
    expect(names[0]).toBe('Meerut');
    const firstInside = names.findIndex((n) => !n.toLowerCase().startsWith('mee'));
    const lastPrefix = names.map((n) => n.toLowerCase().startsWith('mee')).lastIndexOf(true);
    expect(firstInside === -1 || firstInside > lastPrefix).toBe(true);
  });

  it('ranks bigger towns first among equal matches', () => {
    const fatehpurs = searchCities('fatehpur').filter((c) => c.name === 'Fatehpur');
    const pops = fatehpurs.map((c) => c.population);
    expect(pops).toEqual([...pops].sort((a, b) => b - a));
  });

  it('finds old spellings', () => {
    expect(searchCities('Bombay')[0]?.id).toBe('mumbai');
    expect(searchCities('gurgaon')[0]?.id).toBe('gurgaon');
  });

  it('caps the result count', () => {
    expect(searchCities('a').length).toBeLessThanOrEqual(40);
  });
});

describe('cityForCoordinates', () => {
  it('detects Bijnor from a point in town', () => {
    expect(cityForCoordinates({ latitude: 29.37, longitude: 78.14 })?.name).toBe('Bijnor');
  });

  it('keeps a big neighbour city separate from Delhi', () => {
    expect(cityForCoordinates({ latitude: 28.667, longitude: 77.433 })?.id).toBe('ghaziabad');
    expect(cityForCoordinates({ latitude: 28.46, longitude: 77.03 })?.id).toBe('gurgaon');
  });

  it('maps central Delhi to Delhi', () => {
    expect(cityForCoordinates({ latitude: 28.65, longitude: 77.23 })?.id).toBe('delhi');
  });

  it('returns null far from any town', () => {
    expect(cityForCoordinates({ latitude: 51.5, longitude: -0.12 })).toBeNull();
  });
});

describe('nearestCities', () => {
  it('lists towns by distance', () => {
    const at = { latitude: 29.37, longitude: 78.14 };
    const near = nearestCities(at, 5);
    expect(near[0]?.name).toBe('Bijnor');
    const km = near.map((c) => distanceKm(at, { latitude: c.lat, longitude: c.lon }));
    expect(km).toEqual([...km].sort((a, b) => a - b));
  });
});
