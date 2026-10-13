import type {Shelter} from '../services/model';

jest.mock('../apis/disasterAPI', () => ({
  __esModule: true,
  default: {getShelters: jest.fn()},
}));

const HUE = {lat: 16.46, lon: 107.59};
const DAY = 24 * 3600 * 1000;

function shelter(id: string, lat: number, lon: number, official = false): Shelter {
  return {
    id, name: id, address: null, kind: 'school', kind_label: 'Trường học', latitude: lat,
    longitude: lon, distance_km: 0, capacity: null, phone: null, note: null, official,
    source: official ? 'FloodShield' : 'OpenStreetMap',
  };
}

const LIST = [shelter('official', 16.47, 107.6, true), shelter('school', 16.461, 107.591)];

/** A freshly opened app: nothing in memory. `disk` is what the phone kept from before. */
function openApp(disk?: Record<string, string>) {
  jest.resetModules();
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  for (const [key, value] of Object.entries(disk ?? {})) {
    AsyncStorage.setItem(key, value);
  }
  const getShelters: jest.Mock = require('../apis/disasterAPI').default.getShelters;
  getShelters.mockResolvedValue({shelters: LIST});
  return {getShelters, AsyncStorage, ...require('../services/shelters')};
}

afterEach(() => jest.restoreAllMocks());

test('the search started when the app opens is shared with the screen', async () => {
  const app = openApp();
  let answer: (value: {shelters: Shelter[]}) => void = () => {};
  app.getShelters.mockReturnValue(new Promise(resolve => (answer = resolve)));
  app.prefetchShelters(HUE.lat, HUE.lon, 'vi');
  // The screen opens before the search is done, a GPS fix 300 m further.
  const shown = app.loadShelters(HUE.lat + 0.003, HUE.lon, 'vi');
  answer({shelters: LIST});
  expect((await shown).map((s: Shelter) => s.id)).toEqual(['official', 'school']);
  expect(app.getShelters).toHaveBeenCalledTimes(1);
  // Done: the next visit is instant.
  expect(app.savedShelters(HUE.lat, HUE.lon, 'vi')).toHaveLength(2);
});

test('reuses the list nearby for 7 days, and searches again further, later or in English', async () => {
  const app = openApp();
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  await app.loadShelters(HUE.lat, HUE.lon, 'vi');
  await app.loadShelters(HUE.lat + 0.005, HUE.lon, 'vi'); // ~550 m
  expect(app.getShelters).toHaveBeenCalledTimes(1);

  await app.loadShelters(HUE.lat + 0.02, HUE.lon, 'vi'); // ~2 km: another place
  expect(app.getShelters).toHaveBeenCalledTimes(2);

  await app.loadShelters(HUE.lat + 0.02, HUE.lon, 'en'); // labels come in the app's language
  expect(app.getShelters).toHaveBeenCalledTimes(3);

  jest.spyOn(Date, 'now').mockReturnValue(now + 8 * DAY);
  await app.loadShelters(HUE.lat + 0.02, HUE.lon, 'en');
  expect(app.getShelters).toHaveBeenCalledTimes(4);
});

test('pull to refresh always searches again', async () => {
  const app = openApp();
  await app.loadShelters(HUE.lat, HUE.lon, 'vi');
  await app.loadShelters(HUE.lat, HUE.lon, 'vi', true);
  expect(app.getShelters).toHaveBeenCalledTimes(2);
});

test('without network, an older list from here is shown; elsewhere the error is', async () => {
  const now = Date.now();
  const old = JSON.stringify({at: now - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  app.getShelters.mockRejectedValue(new Error('offline'));
  expect(await app.loadShelters(HUE.lat, HUE.lon, 'vi')).toHaveLength(2);
  await expect(app.loadShelters(HUE.lat + 0.1, HUE.lon, 'vi')).rejects.toThrow('offline');
});

test('distances are from where the user is now, official shelters first', async () => {
  const app = openApp();
  await app.loadShelters(HUE.lat, HUE.lon, 'vi');
  // 800 m south: the school is still nearer than the official shelter, but stays after it.
  const shown: Shelter[] = await app.loadShelters(HUE.lat - 0.007, HUE.lon, 'vi');
  expect(shown.map(s => s.id)).toEqual(['official', 'school']);
  expect(shown[1].distance_km).toBeCloseTo(0.89, 1);
  expect(shown[0].distance_km).toBeGreaterThan(shown[1].distance_km);
});

test('the list kept on the phone opens instantly after a restart, and bad data is ignored', async () => {
  const first = openApp();
  await first.loadShelters(HUE.lat, HUE.lon, 'vi');
  const kept = await first.AsyncStorage.getItem('shelters');

  const reopened = openApp({shelters: kept});
  expect(await reopened.loadShelters(HUE.lat, HUE.lon, 'vi')).toHaveLength(2);
  expect(reopened.getShelters).not.toHaveBeenCalled();

  const broken = openApp({shelters: '{"oops": true}'});
  expect(await broken.loadShelters(HUE.lat, HUE.lon, 'vi')).toHaveLength(2);
  expect(broken.getShelters).toHaveBeenCalledTimes(1);
});
