/* Finding the phone's position (services/locationService.ts), with a fake location library. */

type Found = (position: unknown) => void;
type Failed = (error: {code: number; message?: string}) => void;
type Os = 'android' | 'ios';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** A fresh copy of the service, as on this platform, with the library's callbacks caught. */
function load(os: Os, screen = 'active') {
  jest.resetModules();
  const RN = require('react-native');
  RN.Platform.OS = os;
  jest.spyOn(RN.PermissionsAndroid, 'check').mockResolvedValue(true);
  const Geolocation = require('@react-native-community/geolocation');
  const watches: {found: Found; failed: Failed}[] = [];
  const asks: {found: Found; failed: Failed}[] = [];
  Geolocation.watchPosition.mockImplementation((found: Found, failed: Failed) => {
    watches.push({found, failed});
    return watches.length;
  });
  Geolocation.getCurrentPosition.mockImplementation((found: Found, failed: Failed) => {
    asks.push({found, failed});
  });
  const listeners = new Set<(state: string) => void>();
  RN.AppState.currentState = screen;
  RN.AppState.addEventListener.mockImplementation((_: string, listener: (state: string) => void) => {
    listeners.add(listener);
    return {remove: () => listeners.delete(listener)};
  });
  const service = require('../services/locationService');
  const {translate} = require('../i18n');
  return {
    RN,
    Geolocation,
    service: service.default,
    LIMIT_MS: service.LIMIT_MS as number,
    MAX_AGE_MS: service.MAX_AGE_MS as number,
    watches,
    asks,
    listeners,
    translate,
    setScreen: (state: string) => {
      RN.AppState.currentState = state;
      listeners.forEach(listener => listener(state));
    },
  };
}

const at = (latitude: number, longitude: number, ageMs = 0) => ({
  coords: {latitude, longitude, accuracy: 30},
  timestamp: Date.now() - ageMs,
});

/** Lets promises and 0 ms timers run, then moves the clock on. */
const wait = (ms = 0) => jest.advanceTimersByTimeAsync(ms);

/** 'waiting', 'found' or the error message. */
function outcome(promise: Promise<unknown>) {
  let now = 'waiting';
  promise.then(
    () => (now = 'found'),
    (e: Error) => (now = e.message),
  );
  return () => now;
}

// What the library says when location is turned off or not allowed for the app.
const LOCATION_OFF: Record<Os, string[]> = {
  android: ['Location not available (FusedLocationProvider/settings).', 'No location provider available.'],
  ios: ['This application is not authorized to use location services', 'Location services disabled.'],
};
// What it says while still searching.
const NOT_YET: Record<Os, {code: number; message?: string}[]> = {
  android: [{code: 2, message: 'Location not available (FusedLocationProvider).'}, {code: 3, message: 'Location request timed out'}],
  ios: [{code: 2}, {code: 2, message: 'Unable to retrieve location due to a network failure'}],
};

describe.each(['android', 'ios'] as Os[])('%s', os => {
  test('the first position found is used, and the search stops', async () => {
    const t = load(os);
    const position = t.service.getCurrentPosition();
    await wait();
    expect(t.watches).toHaveLength(1);
    t.watches[0].found(at(16.46, 107.59));
    await expect(position).resolves.toEqual({latitude: 16.46, longitude: 107.59});
    expect(t.Geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(t.listeners.size).toBe(0);
  });

  test('asking during a search joins it; the next one is a new search', async () => {
    const t = load(os);
    const first = t.service.getCurrentPosition();
    await wait();
    const second = t.service.getCurrentPosition();
    await wait();
    expect(t.watches).toHaveLength(1);
    t.watches[0].found(at(10.77, 106.7));
    await expect(first).resolves.toEqual({latitude: 10.77, longitude: 106.7});
    await expect(second).resolves.toEqual({latitude: 10.77, longitude: 106.7});

    const third = t.service.getCurrentPosition();
    await wait();
    expect(t.watches).toHaveLength(2);
    t.watches[1].found(at(21.03, 105.85));
    await expect(third).resolves.toEqual({latitude: 21.03, longitude: 105.85});
  });

  test('"not found yet" keeps searching', async () => {
    const t = load(os);
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    for (const error of NOT_YET[os]) {
      t.watches[0].failed(error);
    }
    await wait(t.LIMIT_MS / 2);
    expect(now()).toBe('waiting');
    expect(t.Geolocation.clearWatch).not.toHaveBeenCalled();
    t.watches[0].found(at(16.46, 107.59));
    await wait();
    expect(now()).toBe('found');
  });

  test.each(LOCATION_OFF[os])('location turned off ("%s"): the error comes at once', async message => {
    const t = load(os);
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    t.watches[0].failed({code: 2, message});
    await wait();
    expect(now()).toBe(t.translate('errLocationUnavailable'));
    expect(t.Geolocation.clearWatch).toHaveBeenCalledWith(1);
  });

  test('location not allowed: says so at once', async () => {
    const t = load(os);
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    t.watches[0].failed({code: 1, message: 'Location permission was not granted.'});
    await wait();
    expect(now()).toBe(t.translate('errLocationPermission'));
    expect(t.Geolocation.clearWatch).toHaveBeenCalledWith(1);
  });

  test('nothing within the limit: the error, and the search stops', async () => {
    const t = load(os);
    const now = outcome(t.service.getCurrentPosition());
    await wait(t.LIMIT_MS - 1);
    expect(now()).toBe('waiting');
    await wait(1);
    expect(now()).toBe(t.translate('errLocationUnavailable'));
    expect(t.Geolocation.clearWatch).toHaveBeenCalledWith(1);
    expect(t.listeners.size).toBe(0);
    // A position after the limit changes nothing.
    t.watches[0].found(at(16.46, 107.59));
    await wait();
    expect(now()).toBe(t.translate('errLocationUnavailable'));
  });

  test('an old position is skipped for a new one, and used only if none comes', async () => {
    const t = load(os);
    const position = t.service.getCurrentPosition();
    await wait();
    t.watches[0].found(at(1, 1, t.MAX_AGE_MS + 60 * 1000));
    await wait(1000);
    t.watches[0].found(at(16.46, 107.59));
    await expect(position).resolves.toEqual({latitude: 16.46, longitude: 107.59});

    const fallback = t.service.getCurrentPosition();
    await wait();
    t.watches[1].found(at(1, 1, t.MAX_AGE_MS + 60 * 1000));
    await wait(t.LIMIT_MS);
    await expect(fallback).resolves.toEqual({latitude: 1, longitude: 1});
  });

  test('the limit only counts while the app is on screen', async () => {
    const t = load(os);
    const now = outcome(t.service.getCurrentPosition());
    await wait(t.LIMIT_MS - 1000);
    // The iPhone's "Allow location?" question, or another app.
    t.setScreen('inactive');
    await wait(60 * 1000);
    t.setScreen('background');
    await wait(60 * 1000);
    expect(now()).toBe('waiting');
    // Back on screen: the whole limit again.
    t.setScreen('active');
    await wait(t.LIMIT_MS - 1);
    expect(now()).toBe('waiting');
    t.watches[0].found(at(16.46, 107.59));
    await wait();
    expect(now()).toBe('found');
  });

  test('started off screen: the limit starts when the app comes back', async () => {
    const t = load(os, 'background');
    const now = outcome(t.service.getCurrentPosition());
    await wait(5 * 60 * 1000);
    expect(now()).toBe('waiting');
    t.setScreen('active');
    await wait(t.LIMIT_MS);
    expect(now()).toBe(t.translate('errLocationUnavailable'));
  });
});

describe('android', () => {
  test("uses Google's location", () => {
    const t = load('android');
    expect(t.Geolocation.setRNConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({locationProvider: 'playServices'}),
    );
  });

  test('only watches, with high accuracy (Google can only follow one getCurrentPosition)', async () => {
    const t = load('android');
    t.service.getCurrentPosition();
    await wait();
    expect(t.Geolocation.getCurrentPosition).not.toHaveBeenCalled();
    expect(t.Geolocation.watchPosition.mock.calls[0][2]).toMatchObject({enableHighAccuracy: true, distanceFilter: 0});
  });

  test('location permission refused: no search', async () => {
    const t = load('android');
    jest.spyOn(t.RN.PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(t.RN.PermissionsAndroid, 'requestMultiple').mockResolvedValue({});
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    expect(now()).toBe(t.translate('errLocationPermission'));
    expect(t.watches).toHaveLength(0);
  });
});

describe('ios', () => {
  test('the getCurrentPosition is asked before the watch starts', async () => {
    // Asked while a watch runs, the library pauses the watch and never restarts it.
    const t = load('ios');
    t.service.getCurrentPosition();
    await wait();
    const [ask] = t.Geolocation.getCurrentPosition.mock.invocationCallOrder;
    const [watch] = t.Geolocation.watchPosition.mock.invocationCallOrder;
    expect(ask).toBeLessThan(watch);
  });

  test('one getCurrentPosition alongside: a refusal comes at once', async () => {
    const t = load('ios');
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    expect(t.asks).toHaveLength(1);
    t.asks[0].failed({code: 1});
    await wait();
    expect(now()).toBe(t.translate('errLocationPermission'));
    expect(t.Geolocation.clearWatch).toHaveBeenCalledWith(1);
  });

  test('a recent position it already knew comes at once', async () => {
    const t = load('ios');
    const position = t.service.getCurrentPosition();
    await wait();
    t.asks[0].found(at(16.46, 107.59, 60 * 1000));
    await expect(position).resolves.toEqual({latitude: 16.46, longitude: 107.59});
  });

  test('its timeout or "not found yet" leaves the watch searching', async () => {
    const t = load('ios');
    const now = outcome(t.service.getCurrentPosition());
    await wait();
    t.asks[0].failed({code: 2});
    t.asks[0].failed({code: 3, message: 'Unable to fetch location within 20.0s.'});
    await wait();
    expect(now()).toBe('waiting');
    t.watches[0].found(at(16.46, 107.59));
    await wait();
    expect(now()).toBe('found');
  });
});
