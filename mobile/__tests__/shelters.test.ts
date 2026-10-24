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

test('an older list, or one from a few km away, is shown at once while the new search runs', async () => {
  const now = Date.now();
  const old = JSON.stringify({at: now - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  const NEW = [shelter('new school', 16.49, 107.6)];
  let answer: (value: {shelters: Shelter[]}) => void = () => {};
  app.getShelters.mockReturnValue(new Promise(resolve => (answer = resolve)));

  // 3 km north of where the list was found.
  const shownFirst: Shelter[][] = [];
  const result = app.loadShelters(HUE.lat + 0.027, HUE.lon, 'vi', false, (s: Shelter[]) => shownFirst.push(s));
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(shownFirst).toHaveLength(1);
  expect(shownFirst[0].map(s => s.id)).toEqual(['official', 'school']);
  expect(shownFirst[0][1].distance_km).toBeCloseTo(2.9, 1);
  expect(app.getShelters).toHaveBeenCalledTimes(1);

  answer({shelters: NEW});
  expect((await result).map((s: Shelter) => s.id)).toEqual(['new school']);
  expect(app.keptShelters(HUE.lat + 0.027, HUE.lon, 'vi').map((s: Shelter) => s.id)).toEqual(['new school']);
});

test('not shown first: a list from more than 5 km away, in the other language, or on pull to refresh', async () => {
  const now = Date.now();
  const old = JSON.stringify({at: now - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  // Searches fail, so the kept list stays the same for each case.
  app.getShelters.mockRejectedValue(new Error('offline'));
  const shownFirst = jest.fn();
  await expect(app.loadShelters(HUE.lat + 0.06, HUE.lon, 'vi', false, shownFirst)).rejects.toThrow(); // ~6.7 km
  expect(app.keptShelters(HUE.lat + 0.06, HUE.lon, 'vi')).toBeNull();
  expect(app.keptShelters(HUE.lat + 0.027, HUE.lon, 'vi')).toHaveLength(2);
  await app.loadShelters(HUE.lat, HUE.lon, 'en', false, shownFirst);
  await app.loadShelters(HUE.lat, HUE.lon, 'vi', true, shownFirst);
  expect(shownFirst).not.toHaveBeenCalled();
});

test('a recent list from here needs no new search, so nothing is shown first', async () => {
  const app = openApp();
  await app.loadShelters(HUE.lat, HUE.lon, 'vi');
  const shownFirst = jest.fn();
  expect(await app.loadShelters(HUE.lat, HUE.lon, 'vi', false, shownFirst)).toHaveLength(2);
  expect(shownFirst).not.toHaveBeenCalled();
  expect(app.getShelters).toHaveBeenCalledTimes(1);
});

test('without network, a list from 3 km away beats the error', async () => {
  const now = Date.now();
  const old = JSON.stringify({at: now - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  app.getShelters.mockRejectedValue(new Error('offline'));
  const shown: Shelter[] = await app.loadShelters(HUE.lat + 0.027, HUE.lon, 'vi');
  expect(shown.map(s => s.id)).toEqual(['official', 'school']);
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

// 1.0.7 and older kept the server's empty answer when no server could search, and showed
// "no places within 15 km" for 7 days.
const EMPTY = () =>
  JSON.stringify({at: Date.now() - DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: []});

test('an empty answer is not kept: the next visit searches again', async () => {
  const app = openApp();
  app.getShelters.mockResolvedValue({shelters: []});
  expect(await app.loadShelters(HUE.lat, HUE.lon, 'vi')).toEqual([]);
  expect(app.savedShelters(HUE.lat, HUE.lon, 'vi')).toBeNull();
  expect(await app.AsyncStorage.getItem('shelters')).toBeNull();

  app.getShelters.mockResolvedValue({shelters: LIST});
  expect(await app.loadShelters(HUE.lat, HUE.lon, 'vi')).toHaveLength(2);
  expect(app.getShelters).toHaveBeenCalledTimes(2);
});

test('an empty list kept by an older version counts as nothing kept', async () => {
  const app = openApp({shelters: EMPTY()});
  const shownFirst = jest.fn();
  expect(await app.loadShelters(HUE.lat, HUE.lon, 'vi', false, shownFirst)).toHaveLength(2);
  expect(app.getShelters).toHaveBeenCalledTimes(1);
  expect(shownFirst).not.toHaveBeenCalled();
});

test('without network and only an empty list kept, the error shows, not "none"', async () => {
  const app = openApp({shelters: EMPTY()});
  app.getShelters.mockRejectedValue(new Error('offline'));
  await expect(app.loadShelters(HUE.lat, HUE.lon, 'vi')).rejects.toThrow('offline');
});

test('an empty answer near a list found before shows that list, and keeps it', async () => {
  const old = JSON.stringify({at: Date.now() - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  app.getShelters.mockResolvedValue({shelters: []});
  // 3 km away: places that close can't be missing from a search here, so the empty answer is a
  // search that went wrong, like an error.
  const shown: Shelter[] = await app.loadShelters(HUE.lat + 0.027, HUE.lon, 'vi');
  expect(shown.map(s => s.id)).toEqual(['official', 'school']);
  expect(JSON.parse(await app.AsyncStorage.getItem('shelters')).shelters).toHaveLength(2);
});

test('an empty answer far from the kept list shows "none", and the kept list stays', async () => {
  const old = JSON.stringify({at: Date.now() - 30 * DAY, latitude: HUE.lat, longitude: HUE.lon, lang: 'vi', shelters: LIST});
  const app = openApp({shelters: old});
  app.getShelters.mockResolvedValue({shelters: []});
  expect(await app.loadShelters(HUE.lat + 0.1, HUE.lon, 'vi')).toEqual([]); // ~11 km
  expect(JSON.parse(await app.AsyncStorage.getItem('shelters')).shelters).toHaveLength(2);
});
