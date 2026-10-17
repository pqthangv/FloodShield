import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import disasterAPI from '../apis/disasterAPI';
import NearbySheltersScreen from '../components/home/NearbySheltersScreen';
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
