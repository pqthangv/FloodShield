import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AdditionalInfo from '../components/home/AdditionalInfo';
import WeatherIcon from '../components/WeatherIcon';
import {setLanguageForTests} from '../i18n';
import type {Alert, Severity} from '../services/model';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: jest.fn()}),
}));

const app: {alerts: Alert[]} & Record<string, unknown> = {
  alerts: [],
  alertsError: null,
  alertsChecked: true,
  weather: null,
  location: {latitude: 10.78, longitude: 106.7, mode: 'gps'},
};
jest.mock('../context/AppContext', () => ({useApp: () => app}));

function alert(category: string, severity: Severity): Alert {
  return {
    id: `${category}-${severity}`, category, severity, title: `${category} ${severity}`,
    area: 'TP. Hồ Chí Minh', description: '', starts_at: null, ends_at: null,
    source: 'Open-Meteo', distance_km: null, details: [], disaster_type_id: null, url: null,
  };
}

/** The card's header: the rain picture or the ⚠️, and its title. */
function header(alerts: Alert[]) {
  app.alerts = alerts;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<AdditionalInfo />);
  });
  const texts = tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
  const result = {
    rain: tree.root.findAllByType(WeatherIcon).length === 1,
    warning: texts.includes('⚠️'),
    texts,
  };
  act(() => tree.unmount());
  return result;
}

beforeEach(() => setLanguageForTests('vi'));

test('plain rain shows a rain picture and "Mưa to", not ⚠️ and "Cảnh báo khẩn cấp!"', () => {
  for (const category of ['heavy_rain', 'urban_flood']) {
    const {rain, warning, texts} = header([alert(category, 'moderate')]);
    expect(rain).toBe(true);
    expect(warning).toBe(false);
    expect(texts).toContain('Mưa to');
    expect(texts).not.toContain('Cảnh báo khẩn cấp!');
  }
  setLanguageForTests('en');
  expect(header([alert('heavy_rain', 'moderate')]).texts).toContain('Heavy rain');
});

test('stronger rain and every other warning keep ⚠️ and "Cảnh báo khẩn cấp!"', () => {
  const others = [
    alert('heavy_rain', 'high'), alert('heavy_rain', 'severe'), alert('urban_flood', 'high'),
    alert('wind', 'moderate'), alert('storm', 'moderate'), alert('flood', 'moderate'),
    alert('heat', 'moderate'), alert('landslide', 'high'),
  ];
  for (const a of others) {
    const {rain, warning, texts} = header([a]);
    expect([a.id, rain, warning]).toEqual([a.id, false, true]);
    expect(texts).toContain('Cảnh báo khẩn cấp!');
  }
});

test('several alerts: the rain picture only when all of them are plain rain', () => {
  const twoRains = header([alert('heavy_rain', 'moderate'), alert('urban_flood', 'moderate')]);
  expect([twoRains.rain, twoRains.warning]).toEqual([true, false]);
  expect(twoRains.texts).toContain('Cảnh báo (2)');
  // A "watch" (info) next to it changes nothing.
  const withInfo = header([alert('heavy_rain', 'moderate'), alert('flood', 'info')]);
  expect([withInfo.rain, withInfo.warning]).toEqual([true, false]);
  // Wind as strong next to it: ⚠️.
  const withWind = header([alert('heavy_rain', 'moderate'), alert('wind', 'moderate')]);
  expect([withWind.rain, withWind.warning]).toEqual([false, true]);
  const withStorm = header([alert('storm', 'severe'), alert('heavy_rain', 'moderate')]);
  expect([withStorm.rain, withStorm.warning]).toEqual([false, true]);
});

test('only a "watch" still shows ⚠️, as before', () => {
  const {rain, warning} = header([alert('flood', 'info')]);
  expect([rain, warning]).toEqual([false, true]);
});
