import { describe, expect, it, jest } from '@jest/globals';

import { isBelow, parseVersion } from '@/features/update/services/version.service';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('version check', () => {
  it('parses plain and suffixed versions', () => {
    expect(parseVersion('4.0.0')).toEqual([4, 0, 0]);
    expect(parseVersion('4.10.2-beta')).toEqual([4, 10, 2]);
    expect(parseVersion('four')).toBeNull();
  });

  it('compares part by part, not as text', () => {
    expect(isBelow('4.2.0', '4.10.0')).toBe(true);
    expect(isBelow('4.10.0', '4.2.0')).toBe(false);
    expect(isBelow('4.0.0', '4.0.0')).toBe(false);
    expect(isBelow('3.9.9', '4.0.0')).toBe(true);
  });

  it('never blocks on a version it cannot read', () => {
    expect(isBelow('dev', '4.0.0')).toBe(false);
    expect(isBelow('4.0.0', '')).toBe(false);
  });
});
