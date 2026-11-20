import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'p1' } } } }));

const mockPermissions = { granted: false, canAskAgain: true };
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockScheduleSync = jest.fn(async () => undefined);

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: async () => ({ ...mockPermissions }),
  requestPermissionsAsync: () => mockRequestPermissions(),
  setNotificationChannelAsync: async () => null,
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[abc]' }),
}));
jest.mock('@/shared/sync', () => ({
  scheduleSync: (...args: unknown[]) => mockScheduleSync(...(args as [])),
  shouldCloudSync: () => true,
}));
jest.mock('@/shared/storage/local-store', () => ({
  loadStore: async () => undefined,
  getStore: () => ({ user: { uid: 'u1' } }),
}));

type Push = typeof import('@/features/notifications/services/push.service');

function fresh(): Push {
  let mod: Push | undefined;
  jest.isolateModules(() => {
    mod = require('@/features/notifications/services/push.service') as Push;
  });
  if (!mod) {
    throw new Error('module not loaded');
  }
  return mod;
}

describe('push permission', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockPermissions.granted = false;
    mockPermissions.canAskAgain = true;
    mockRequestPermissions.mockClear();
    mockScheduleSync.mockClear();
  });

  it('is never asked at start-up', async () => {
    await fresh().registerForPush();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockScheduleSync).not.toHaveBeenCalled();
  });

  it('registers at start-up when already allowed', async () => {
    mockPermissions.granted = true;
    await fresh().registerForPush();
    expect(mockScheduleSync).toHaveBeenCalledTimes(1);
  });

  it('is offered once, then not again for 30 days', async () => {
    const push = fresh();
    const day0 = new Date('2026-11-14T10:00:00Z');
    expect(await push.pushOfferState(day0)).toBe('offer');
    await push.notePushOffered(day0);
    expect(await push.pushOfferState(new Date('2026-12-01T10:00:00Z'))).toBe('skip');
    expect(await push.pushOfferState(new Date('2026-12-15T10:00:00Z'))).toBe('offer');
  });

  it('is not offered when the phone will not ask again', async () => {
    mockPermissions.canAskAgain = false;
    expect(await fresh().pushOfferState()).toBe('skip');
  });

  it('asks the phone and registers only after a yes', async () => {
    const push = fresh();
    expect(await push.enablePush()).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockScheduleSync).toHaveBeenCalledTimes(1);

    mockRequestPermissions.mockImplementationOnce(async () => ({ granted: false }));
    mockScheduleSync.mockClear();
    expect(await fresh().enablePush()).toBe(false);
    expect(mockScheduleSync).not.toHaveBeenCalled();
  });
});
