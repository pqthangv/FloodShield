import React from 'react';
import {AppState, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import disasterAPI from '../apis/disasterAPI';
import NearbySheltersScreen, {RETRIES, RETRY_MS} from '../components/home/NearbySheltersScreen';
import {I18nProvider, translate} from '../i18n';
import type {Shelter} from '../services/model';
import {forgetSheltersForTests, prefetchShelters} from '../services/shelters';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: jest.fn()}),
  useIsFocused: () => true,
}));

// 3 km north of where the kept list was found. One object, like the app's state (the screen
// searches again when the location changes).
const HERE = {latitude: 16.487, longitude: 107.59};
jest.mock('../context/AppContext', () => {
  const app = {location: {latitude: 16.487, longitude: 107.59, mode: 'gps'}};
  return {useApp: () => app};
});

jest.mock('../apis/disasterAPI', () => ({
  __esModule: true,
  default: {getShelters: jest.fn()},
}));

type Tree = ReactTestRenderer.ReactTestRenderer;

const DAY = 24 * 3600 * 1000;

function shelter(id: string, lat: number, lon: number): Shelter {
  return {
    id, name: id, address: null, kind: 'school', kind_label: 'Trường học', latitude: lat,
    longitude: lon, distance_km: 0, capacity: null, phone: null, note: null, official: false,
    source: 'OpenStreetMap',
  };
}

const OLD = [shelter('Trường cũ', 16.461, 107.591)];
const NEW = [shelter('Trường mới', 16.488, 107.59)];
const getShelters = disasterAPI.getShelters as jest.Mock;
let answer: (list: Shelter[]) => void = () => {};

// A freshly opened app in Vietnamese; the kept list is on the phone, 30 days old.
beforeEach(async () => {
  forgetSheltersForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('language', 'vi');
  await AsyncStorage.setItem(
    'shelters',
    JSON.stringify({at: Date.now() - 30 * DAY, latitude: 16.46, longitude: 107.59, lang: 'vi', shelters: OLD}),
  );
  getShelters.mockReset();
  getShelters.mockReturnValue(new Promise(resolve => (answer = list => resolve({shelters: list}))));
});

const texts = (tree: Tree) =>
  tree.root.findAll(node => node.type === Text).map(node => [node.props.children].flat().join(''));

// In the app's language provider, as in App.tsx (it reads the saved language first).
async function open() {
  let tree!: Tree;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <I18nProvider>
        <NearbySheltersScreen />
      </I18nProvider>,
    );
  });
  return tree;
}

test('the kept list shows at once, without the spinner, and the new search replaces it', async () => {
  const tree = await open();
  expect(texts(tree)).toContain('Trường cũ');
  expect(texts(tree)).not.toContain(translate('findingShelters'));
  expect(getShelters).toHaveBeenCalledTimes(1);

  await act(async () => answer(NEW));
  expect(texts(tree)).toContain('Trường mới');
  expect(texts(tree)).not.toContain('Trường cũ');
  await act(async () => tree.unmount());
});

test('found in the background before the screen opens: shown with no search of its own', async () => {
  // What AppContext starts when the app opens.
  prefetchShelters(HERE.latitude, HERE.longitude, 'vi');
  await act(async () => answer(NEW));
  const tree = await open();
  expect(texts(tree)).toContain('Trường mới');
  expect(texts(tree)).not.toContain(translate('findingShelters'));
  expect(getShelters).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('if the new search fails, the kept list stays instead of an error', async () => {
  getShelters.mockRejectedValue(new Error('Overpass is busy'));
  const tree = await open();
  expect(texts(tree)).toContain('Trường cũ');
  expect(texts(tree).join(' ')).not.toContain('Overpass is busy');
  await act(async () => tree.unmount());
});

test('with nothing kept from around here, the spinner shows until the search ends', async () => {
  await AsyncStorage.removeItem('shelters');
  const tree = await open();
  expect(texts(tree)).toContain(translate('findingShelters'));
  await act(async () => answer(NEW));
  expect(texts(tree)).toContain('Trường mới');
  await act(async () => tree.unmount());
});

test('an empty list kept by an older version: the spinner and a new search, not "none"', async () => {
  // What 1.0.7 kept on the user's iPhone when no server could search (2026-10-22).
  await AsyncStorage.setItem(
    'shelters',
    JSON.stringify({at: Date.now() - DAY, ...HERE, lang: 'vi', shelters: []}),
  );
  const tree = await open();
  expect(texts(tree)).toContain(translate('findingShelters'));
  expect(texts(tree)).not.toContain(translate('noShelters'));
  expect(getShelters).toHaveBeenCalledTimes(1);
  await act(async () => answer(NEW));
  expect(texts(tree)).toContain('Trường mới');
  await act(async () => tree.unmount());
});

test('a search that finds nothing says so, and the next visit searches again', async () => {
  await AsyncStorage.removeItem('shelters');
  const first = await open();
  await act(async () => answer([]));
  expect(texts(first)).toContain(translate('noShelters'));
  await act(async () => first.unmount());

  getShelters.mockReturnValue(new Promise(resolve => (answer = list => resolve({shelters: list}))));
  const second = await open();
  expect(texts(second)).toContain(translate('findingShelters'));
  expect(getShelters).toHaveBeenCalledTimes(2);
  await act(async () => answer(NEW));
  expect(texts(second)).toContain('Trường mới');
  await act(async () => second.unmount());
});

describe('after a failed search with nothing on screen, it tries again by itself', () => {
  const OFFLINE = () => translate('errOffline');
  const listeners = new Set<(state: string) => void>();
  const setScreen = (state: string) =>
    act(async () => {
      (AppState as {currentState: string}).currentState = state;
      listeners.forEach(listener => listener(state));
    });
  // The clock moves in 5 s steps, each in its own act, so React runs its effects in between (as
  // on a phone): one big jump would hide the retries scheduled after the first.
  const wait = async (ms: number) => {
    for (let left = ms; left > 0; left -= 5000) {
      const step = Math.min(5000, left);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(step);
      });
    }
  };
  const retryButton = (tree: Tree) =>
    tree.root.findAll(node => node.type === Text && node.props.children === translate('retry'))[0];
  // A tap doesn't wait for the search it starts.
  const tapRetry = (tree: Tree) =>
    act(async () => {
      retryButton(tree).props.onPress();
    });

  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.removeItem('shelters');
    getShelters.mockRejectedValue(new Error('no server answers'));
    (AppState as {currentState: string}).currentState = 'active';
    (AppState.addEventListener as jest.Mock).mockImplementation((_: string, listener: (state: string) => void) => {
      listeners.add(listener);
      return {remove: () => listeners.delete(listener)};
    });
  });
  afterEach(() => {
    listeners.clear();
    jest.useRealTimers();
  });

  test('a minute later, and the list replaces the error; the error stays while it searches', async () => {
    const tree = await open();
    expect(texts(tree)).toContain(OFFLINE());
    expect(texts(tree)).toContain(translate('retry'));

    let found: (list: Shelter[]) => void = () => {};
    getShelters.mockReturnValue(new Promise(resolve => (found = list => resolve({shelters: list}))));
    await wait(RETRY_MS - 1000);
    expect(getShelters).toHaveBeenCalledTimes(1);
    await wait(1000);
    expect(getShelters).toHaveBeenCalledTimes(2);
    // Searching quietly: the same error, no spinner and no "none".
    expect(texts(tree)).toContain(OFFLINE());
    expect(texts(tree)).not.toContain(translate('findingShelters'));
    expect(texts(tree)).not.toContain(translate('noShelters'));

    await act(async () => found(NEW));
    expect(texts(tree)).toContain('Trường mới');
    expect(texts(tree)).not.toContain(OFFLINE());
    await wait(10 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(2);
    await act(async () => tree.unmount());
  });

  test(`at most ${RETRIES} times; a tap on "Thử lại" gives it ${RETRIES} more`, async () => {
    const tree = await open();
    await wait(20 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(1 + RETRIES);
    expect(texts(tree)).toContain(OFFLINE());
    expect(texts(tree)).toContain(translate('retry'));

    await tapRetry(tree);
    expect(getShelters).toHaveBeenCalledTimes(2 + RETRIES);
    await wait(20 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(2 + 2 * RETRIES);
    await act(async () => tree.unmount());
  });

  test('not while a list is on screen', async () => {
    // A list kept from 3 km away is shown, and the new search fails.
    await AsyncStorage.setItem(
      'shelters',
      JSON.stringify({at: Date.now() - 30 * DAY, latitude: 16.46, longitude: 107.59, lang: 'vi', shelters: OLD}),
    );
    const tree = await open();
    expect(texts(tree)).toContain('Trường cũ');
    await wait(10 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('not after the screen is closed', async () => {
    const tree = await open();
    await act(async () => tree.unmount());
    await wait(10 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(1);
  });

  test('not while the app is in the background; back on screen, a minute later', async () => {
    const tree = await open();
    await setScreen('background');
    await wait(10 * RETRY_MS);
    expect(getShelters).toHaveBeenCalledTimes(1);
    await setScreen('active');
    await wait(RETRY_MS - 1000);
    expect(getShelters).toHaveBeenCalledTimes(1);
    await wait(1000);
    expect(getShelters).toHaveBeenCalledTimes(2);
    await act(async () => tree.unmount());
  });

  test('"Thử lại" shows that it is searching, not "none", until the answer', async () => {
    const tree = await open();
    let found: (list: Shelter[]) => void = () => {};
    getShelters.mockReturnValue(new Promise(resolve => (found = list => resolve({shelters: list}))));
    await tapRetry(tree);
    expect(texts(tree)).toContain(translate('findingShelters'));
    expect(texts(tree)).not.toContain(translate('noShelters'));
    expect(texts(tree)).not.toContain(OFFLINE());
    await act(async () => found(NEW));
    expect(texts(tree)).toContain('Trường mới');
    await act(async () => tree.unmount());
  });
});
